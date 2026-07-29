create extension if not exists pg_cron;
create extension if not exists pg_net;

with ranked_waiting as (
  select
    id,
    row_number() over (
      partition by user_id, network, asset_code
      order by (expires_at > now()) desc, created_at desc
    ) as waiting_rank
  from public.ton_deposit_invoices
  where status = 'waiting'
)
update public.ton_deposit_invoices as invoice
set status = 'expired'
from ranked_waiting
where invoice.id = ranked_waiting.id
  and (
    invoice.expires_at <= now()
    or ranked_waiting.waiting_rank > 1
  );

create unique index if not exists ton_deposit_invoices_one_waiting_per_user_idx
on public.ton_deposit_invoices (user_id, network, asset_code)
where status = 'waiting';

create table if not exists public.ton_invoice_scan_windows (
  invoice_id uuid primary key references public.ton_deposit_invoices(id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  max_attempts integer not null default 10 check (max_attempts between 1 and 10),
  status text not null default 'active' check (status in ('active', 'completed', 'exhausted')),
  started_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_request_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ton_invoice_scan_windows enable row level security;

grant select, insert, update, delete on table public.ton_invoice_scan_windows to service_role;

drop trigger if exists touch_ton_invoice_scan_windows_updated_at on public.ton_invoice_scan_windows;
create trigger touch_ton_invoice_scan_windows_updated_at
before update on public.ton_invoice_scan_windows
for each row
execute function public.touch_updated_at();

create or replace function public.stop_ton_deposit_scan_job()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'open-abundance-ton-deposit-scan'
  ) then
    perform cron.unschedule('open-abundance-ton-deposit-scan');
  end if;
end;
$$;

revoke all on function public.stop_ton_deposit_scan_job() from public, anon, authenticated;

create or replace function public.dispatch_ton_deposit_scan()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url text;
  v_scanner_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
  into v_project_url
  from vault.decrypted_secrets
  where name = 'ton_scanner_project_url'
  limit 1;

  select decrypted_secret
  into v_scanner_secret
  from vault.decrypted_secrets
  where name = 'ton_scanner_secret'
  limit 1;

  if v_project_url is null or v_scanner_secret is null then
    raise exception 'TON scanner Vault configuration is missing.';
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/deposits/scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ton-scanner-secret', v_scanner_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_ton_deposit_scan() from public, anon, authenticated;
grant execute on function public.dispatch_ton_deposit_scan() to service_role;

create or replace function public.run_ton_deposit_scan_window()
returns bigint
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_request_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('open-abundance-ton-deposit-scan'));

  update public.ton_invoice_scan_windows as scan_window
  set
    status = case when invoice.status = 'expired' then 'exhausted' else 'completed' end,
    completed_at = now()
  from public.ton_deposit_invoices as invoice
  where invoice.id = scan_window.invoice_id
    and scan_window.status = 'active'
    and invoice.status in (
      'credited',
      'credited_late',
      'credited_amount_mismatch',
      'unmatched',
      'expired'
    );

  update public.ton_deposit_invoices as invoice
  set
    status = 'expired',
    expires_at = least(invoice.expires_at, now())
  from public.ton_invoice_scan_windows as scan_window
  where scan_window.invoice_id = invoice.id
    and scan_window.status = 'active'
    and invoice.status = 'waiting'
    and scan_window.attempt_count >= scan_window.max_attempts;

  update public.ton_invoice_scan_windows as scan_window
  set
    status = 'exhausted',
    completed_at = now()
  from public.ton_deposit_invoices as invoice
  where invoice.id = scan_window.invoice_id
    and scan_window.status = 'active'
    and invoice.status = 'expired';

  if not exists (
    select 1
    from public.ton_invoice_scan_windows
    where status = 'active'
  ) then
    perform public.stop_ton_deposit_scan_job();
    return null;
  end if;

  v_request_id := public.dispatch_ton_deposit_scan();

  update public.ton_invoice_scan_windows as scan_window
  set
    attempt_count = case
      when invoice.status = 'waiting'
        then least(scan_window.attempt_count + 1, scan_window.max_attempts)
      else scan_window.attempt_count
    end,
    last_attempt_at = now(),
    last_request_id = v_request_id
  from public.ton_deposit_invoices as invoice
  where invoice.id = scan_window.invoice_id
    and scan_window.status = 'active';

  return v_request_id;
end;
$$;

revoke all on function public.run_ton_deposit_scan_window() from public, anon, authenticated;

create or replace function public.start_ton_invoice_scan(
  p_invoice_id uuid,
  p_reset boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, cron, vault
as $$
declare
  v_invoice_status text;
  v_job_exists boolean;
  v_vault_configured boolean;
begin
  select status
  into v_invoice_status
  from public.ton_deposit_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'TON deposit invoice % does not exist.', p_invoice_id;
  end if;

  if v_invoice_status <> 'waiting' then
    return;
  end if;

  insert into public.ton_invoice_scan_windows (
    invoice_id,
    attempt_count,
    max_attempts,
    status,
    started_at,
    refreshed_at,
    last_attempt_at,
    completed_at,
    last_request_id
  )
  values (
    p_invoice_id,
    0,
    10,
    'active',
    now(),
    now(),
    null,
    null,
    null
  )
  on conflict (invoice_id) do update
  set
    attempt_count = case when p_reset then 0 else public.ton_invoice_scan_windows.attempt_count end,
    max_attempts = 10,
    status = 'active',
    started_at = case when p_reset then now() else public.ton_invoice_scan_windows.started_at end,
    refreshed_at = now(),
    last_attempt_at = case when p_reset then null else public.ton_invoice_scan_windows.last_attempt_at end,
    completed_at = null,
    last_request_id = case when p_reset then null else public.ton_invoice_scan_windows.last_request_id end;

  update public.ton_deposit_invoices
  set expires_at = now() + interval '110 seconds'
  where id = p_invoice_id;

  select exists (
    select 1
    from cron.job
    where jobname = 'open-abundance-ton-deposit-scan'
  )
  into v_job_exists;

  perform cron.schedule(
    'open-abundance-ton-deposit-scan',
    '10 seconds',
    'select public.run_ton_deposit_scan_window();'
  );

  select
    exists (
      select 1
      from vault.decrypted_secrets
      where name = 'ton_scanner_project_url'
        and decrypted_secret is not null
    )
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'ton_scanner_secret'
        and decrypted_secret is not null
    )
  into v_vault_configured;

  if not v_job_exists and v_vault_configured then
    perform public.run_ton_deposit_scan_window();
  end if;
end;
$$;

revoke all on function public.start_ton_invoice_scan(uuid, boolean) from public, anon, authenticated;
grant execute on function public.start_ton_invoice_scan(uuid, boolean) to service_role;

create or replace function public.start_ton_invoice_scan_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.start_ton_invoice_scan(new.id, true);
  return new;
end;
$$;

revoke all on function public.start_ton_invoice_scan_after_insert() from public, anon, authenticated;

drop trigger if exists start_ton_invoice_scan_after_insert on public.ton_deposit_invoices;
create trigger start_ton_invoice_scan_after_insert
after insert on public.ton_deposit_invoices
for each row
when (new.status = 'waiting')
execute function public.start_ton_invoice_scan_after_insert();

create or replace function public.configure_ton_deposit_scanner(
  p_project_url text,
  p_scanner_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_project_url text := rtrim(btrim(p_project_url), '/');
  v_scanner_secret text := btrim(p_scanner_secret);
  v_secret_id uuid;
  v_invoice_id uuid;
begin
  if v_project_url !~ '^https://[^[:space:]]+$' then
    raise exception 'TON scanner project URL must be an HTTPS URL.';
  end if;

  if length(v_scanner_secret) < 32 then
    raise exception 'TON scanner secret must contain at least 32 characters.';
  end if;

  select id
  into v_secret_id
  from vault.decrypted_secrets
  where name = 'ton_scanner_project_url'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      v_project_url,
      'ton_scanner_project_url',
      'Open Abundance application URL for the TON deposit scanner.'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_project_url,
      'ton_scanner_project_url',
      'Open Abundance application URL for the TON deposit scanner.'
    );
  end if;

  select id
  into v_secret_id
  from vault.decrypted_secrets
  where name = 'ton_scanner_secret'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      v_scanner_secret,
      'ton_scanner_secret',
      'Server-to-server secret for the TON deposit scanner.'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_scanner_secret,
      'ton_scanner_secret',
      'Server-to-server secret for the TON deposit scanner.'
    );
  end if;

  for v_invoice_id in
    select id
    from public.ton_deposit_invoices
    where status = 'waiting'
      and expires_at > now()
  loop
    perform public.start_ton_invoice_scan(v_invoice_id, true);
  end loop;
end;
$$;

revoke all on function public.configure_ton_deposit_scanner(text, text) from public, anon, authenticated;
grant execute on function public.configure_ton_deposit_scanner(text, text) to service_role;

create or replace function public.ton_deposit_scanner_status()
returns table (
  job_id bigint,
  schedule text,
  active boolean,
  active_windows bigint,
  project_url_configured boolean,
  scanner_secret_configured boolean
)
language sql
security definer
set search_path = public, cron, vault
as $$
  select
    job.jobid,
    job.schedule,
    coalesce(job.active, false),
    (
      select count(*)
      from public.ton_invoice_scan_windows
      where status = 'active'
    ),
    exists (
      select 1
      from vault.decrypted_secrets
      where name = 'ton_scanner_project_url'
        and decrypted_secret is not null
    ),
    exists (
      select 1
      from vault.decrypted_secrets
      where name = 'ton_scanner_secret'
        and decrypted_secret is not null
    )
  from (values (true)) as singleton(seed)
  left join lateral (
    select jobid, schedule, active
    from cron.job
    where jobname = 'open-abundance-ton-deposit-scan'
    limit 1
  ) as job on singleton.seed;
$$;

revoke all on function public.ton_deposit_scanner_status() from public, anon, authenticated;
grant execute on function public.ton_deposit_scanner_status() to service_role;

do $$
begin
  perform public.stop_ton_deposit_scan_job();
end;
$$;
