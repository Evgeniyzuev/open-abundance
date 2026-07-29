-- Replace per-invoice scan windows with one permanent, cursor-driven TON pipeline.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'open-abundance-ton-deposit-scan',
      'open-abundance-ton-deposit-pipeline'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

drop trigger if exists start_ton_invoice_scan_after_insert on public.ton_deposit_invoices;
drop function if exists public.start_ton_invoice_scan_after_insert();
drop function if exists public.start_ton_invoice_scan(uuid, boolean);
drop function if exists public.run_ton_deposit_scan_window();
drop function if exists public.ton_deposit_scanner_status();
drop table if exists public.ton_invoice_scan_windows;

alter table public.ton_deposit_invoices
  drop constraint if exists ton_deposit_invoices_status_check;

alter table public.ton_deposit_invoices
  alter column status set default 'ready';

update public.ton_deposit_invoices
set status = 'ready'
where status in ('waiting', 'checking', 'not_found', 'scan_error');

with ranked_active as (
  select
    id,
    row_number() over (
      partition by user_id, network, asset_code
      order by created_at desc
    ) as active_rank
  from public.ton_deposit_invoices
  where status in (
    'ready',
    'detected',
    'finalizing',
    'confirmed_pending_credit',
    'awaiting_rate'
  )
)
update public.ton_deposit_invoices as invoice
set status = 'expired',
    expires_at = least(invoice.expires_at, now())
from ranked_active
where invoice.id = ranked_active.id
  and ranked_active.active_rank > 1;

alter table public.ton_deposit_invoices
  add constraint ton_deposit_invoices_status_check
  check (status in (
    'ready',
    'detected',
    'finalizing',
    'confirmed_pending_credit',
    'credited',
    'credited_late',
    'credited_amount_mismatch',
    'rejected',
    'cancelled',
    'unmatched',
    'awaiting_rate',
    'expired'
  ));

drop index if exists public.ton_deposit_invoices_one_waiting_per_user_idx;
drop index if exists public.ton_deposit_invoices_one_active_per_user_idx;
create unique index ton_deposit_invoices_one_active_per_user_idx
on public.ton_deposit_invoices (user_id, network, asset_code)
where status in (
  'ready',
  'detected',
  'finalizing',
  'confirmed_pending_credit',
  'awaiting_rate'
);

alter table public.ton_chain_events
  add column if not exists rejection_reason text;

do $$
declare
  v_backfill_count integer;
begin
  select count(*)
  into v_backfill_count
  from public.ton_chain_events
  where status = 'unmatched'
    and invoice_code is null
    and settlement_user_id is null
    and settlement_ledger_id is null
    and settled_at is null
    and created_at >= timestamptz '2026-07-28 20:34:57+00'
    and created_at < timestamptz '2026-07-28 20:35:19+00';

  if v_backfill_count <> 37 then
    raise exception 'Expected exactly 37 historical TON backfill events, found %.', v_backfill_count;
  end if;

  delete from public.ton_chain_events
  where status = 'unmatched'
    and invoice_code is null
    and settlement_user_id is null
    and settlement_ledger_id is null
    and settled_at is null
    and created_at >= timestamptz '2026-07-28 20:34:57+00'
    and created_at < timestamptz '2026-07-28 20:35:19+00';
end;
$$;

create table public.ton_chain_scan_leases (
  network text not null check (network in ('testnet', 'mainnet')),
  deposit_address text not null,
  run_id uuid not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (network, deposit_address)
);

alter table public.ton_chain_scan_leases enable row level security;
grant select, insert, update, delete on table public.ton_chain_scan_leases to service_role;

create table public.ton_deposit_settlement_retries (
  chain_event_id uuid primary key references public.ton_chain_events(id) on delete cascade,
  invoice_id uuid references public.ton_deposit_invoices(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'manual_review')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 12),
  max_attempts integer not null default 12 check (max_attempts between 1 and 12),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ton_deposit_settlement_retries_due_idx
on public.ton_deposit_settlement_retries (next_attempt_at, created_at)
where status = 'pending';

alter table public.ton_deposit_settlement_retries enable row level security;
grant select, insert, update, delete on table public.ton_deposit_settlement_retries to service_role;

drop trigger if exists touch_ton_deposit_settlement_retries_updated_at on public.ton_deposit_settlement_retries;
create trigger touch_ton_deposit_settlement_retries_updated_at
before update on public.ton_deposit_settlement_retries
for each row execute function public.touch_updated_at();

create or replace function public.create_or_reuse_ton_deposit_invoice(
  p_user_id uuid,
  p_network text,
  p_asset_code text,
  p_invoice_code text,
  p_deposit_address text,
  p_expected_amount_nano numeric,
  p_expires_at timestamptz,
  p_replace_active boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  network text,
  asset_code text,
  invoice_code text,
  deposit_address text,
  expected_amount_nano numeric,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.ton_deposit_invoices%rowtype;
  v_invoice_id uuid;
begin
  if p_user_id is null then
    raise exception 'TON deposit user is required.';
  end if;
  if p_expected_amount_nano is not null and p_expected_amount_nano <= 0 then
    raise exception 'Expected TON amount must be positive.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_network || ':' || p_asset_code,
    0
  ));

  select invoice.*
  into v_invoice
  from public.ton_deposit_invoices as invoice
  where invoice.user_id = p_user_id
    and invoice.network = p_network
    and invoice.asset_code = p_asset_code
    and invoice.status in (
      'ready',
      'detected',
      'finalizing',
      'confirmed_pending_credit',
      'awaiting_rate'
    )
  order by invoice.created_at desc
  limit 1
  for update;

  if found and not p_replace_active then
    return query select
      v_invoice.id,
      v_invoice.user_id,
      v_invoice.network,
      v_invoice.asset_code,
      v_invoice.invoice_code,
      v_invoice.deposit_address,
      v_invoice.expected_amount_nano,
      v_invoice.status,
      v_invoice.expires_at,
      v_invoice.created_at,
      v_invoice.updated_at,
      true;
    return;
  end if;

  if found then
    update public.ton_deposit_invoices
    set status = 'cancelled',
        expires_at = least(expires_at, now())
    where ton_deposit_invoices.id = v_invoice.id;
  end if;

  insert into public.ton_deposit_invoices (
    user_id,
    network,
    asset_code,
    invoice_code,
    deposit_address,
    expected_amount_nano,
    status,
    expires_at
  ) values (
    p_user_id,
    p_network,
    p_asset_code,
    p_invoice_code,
    p_deposit_address,
    p_expected_amount_nano,
    'ready',
    p_expires_at
  )
  returning ton_deposit_invoices.id into v_invoice_id;

  select invoice.*
  into strict v_invoice
  from public.ton_deposit_invoices as invoice
  where invoice.id = v_invoice_id;

  return query select
    v_invoice.id,
    v_invoice.user_id,
    v_invoice.network,
    v_invoice.asset_code,
    v_invoice.invoice_code,
    v_invoice.deposit_address,
    v_invoice.expected_amount_nano,
    v_invoice.status,
    v_invoice.expires_at,
    v_invoice.created_at,
    v_invoice.updated_at,
    false;
end;
$$;

revoke all on function public.create_or_reuse_ton_deposit_invoice(
  uuid, text, text, text, text, numeric, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.create_or_reuse_ton_deposit_invoice(
  uuid, text, text, text, text, numeric, timestamptz, boolean
) to service_role;

create or replace function public.claim_ton_chain_scan(
  p_network text,
  p_deposit_address text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_claimed_id uuid;
begin
  insert into public.ton_chain_scan_leases (
    network,
    deposit_address,
    run_id,
    lease_until,
    updated_at
  ) values (
    p_network,
    p_deposit_address,
    v_run_id,
    now() + interval '55 seconds',
    now()
  )
  on conflict (network, deposit_address) do update
  set run_id = excluded.run_id,
      lease_until = excluded.lease_until,
      updated_at = now()
  where ton_chain_scan_leases.lease_until <= now()
  returning run_id into v_claimed_id;

  return v_claimed_id;
end;
$$;

revoke all on function public.claim_ton_chain_scan(text, text) from public, anon, authenticated;
grant execute on function public.claim_ton_chain_scan(text, text) to service_role;

create or replace function public.release_ton_chain_scan(p_run_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ton_chain_scan_leases
  where run_id = p_run_id;
$$;

revoke all on function public.release_ton_chain_scan(uuid) from public, anon, authenticated;
grant execute on function public.release_ton_chain_scan(uuid) to service_role;

create or replace function public.enqueue_ton_deposit_settlement_retry(p_chain_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ton_chain_events%rowtype;
  v_invoice_id uuid;
begin
  select *
  into v_event
  from public.ton_chain_events
  where id = p_chain_event_id
  for update;

  if not found then
    raise exception 'TON chain event not found.';
  end if;

  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'unmatched', 'failed') then
    return;
  end if;

  if v_event.invoice_code is not null then
    select id
    into v_invoice_id
    from public.ton_deposit_invoices
    where invoice_code = v_event.invoice_code
    limit 1;
  end if;

  insert into public.ton_deposit_settlement_retries (
    chain_event_id,
    invoice_id,
    status,
    next_attempt_at
  ) values (
    v_event.id,
    v_invoice_id,
    'pending',
    now()
  )
  on conflict (chain_event_id) do nothing;

  if v_invoice_id is not null then
    update public.ton_deposit_invoices
    set status = 'confirmed_pending_credit'
    where id = v_invoice_id
      and status in ('ready', 'detected', 'finalizing', 'awaiting_rate');
  end if;
end;
$$;

revoke all on function public.enqueue_ton_deposit_settlement_retry(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_ton_deposit_settlement_retry(uuid) to service_role;

create or replace function public.claim_ton_deposit_settlement_retries(p_limit integer default 25)
returns table (
  chain_event_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select retry.chain_event_id
    from public.ton_deposit_settlement_retries as retry
    where (
      retry.status = 'pending'
      and retry.next_attempt_at <= now()
    ) or (
      retry.status = 'processing'
      and retry.locked_at < now() - interval '2 minutes'
    )
    order by retry.next_attempt_at, retry.created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.ton_deposit_settlement_retries as retry
  set status = 'processing',
      attempt_count = least(retry.attempt_count + 1, retry.max_attempts),
      locked_at = now(),
      error_code = null,
      error_message = null
  from due
  where retry.chain_event_id = due.chain_event_id
  returning retry.chain_event_id, retry.attempt_count;
end;
$$;

revoke all on function public.claim_ton_deposit_settlement_retries(integer) from public, anon, authenticated;
grant execute on function public.claim_ton_deposit_settlement_retries(integer) to service_role;

create or replace function public.fail_ton_deposit_settlement_retry(
  p_chain_event_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ton_deposit_settlement_retries
  set status = case when attempt_count >= max_attempts then 'manual_review' else 'pending' end,
      next_attempt_at = now() + case
        when attempt_count <= 1 then interval '15 seconds'
        when attempt_count = 2 then interval '30 seconds'
        when attempt_count = 3 then interval '1 minute'
        when attempt_count = 4 then interval '2 minutes'
        else interval '5 minutes'
      end,
      locked_at = null,
      error_code = left(coalesce(p_error_code, 'unknown'), 120),
      error_message = left(coalesce(p_error_message, 'TON settlement failed.'), 2000)
  where chain_event_id = p_chain_event_id
    and status = 'processing';
end;
$$;

revoke all on function public.fail_ton_deposit_settlement_retry(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fail_ton_deposit_settlement_retry(uuid, text, text) to service_role;

create or replace function public.complete_ton_deposit_settlement_retry(p_chain_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ton_deposit_settlement_retries
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      locked_at = null,
      error_code = null,
      error_message = null
  where chain_event_id = p_chain_event_id;
$$;

revoke all on function public.complete_ton_deposit_settlement_retry(uuid) from public, anon, authenticated;
grant execute on function public.complete_ton_deposit_settlement_retry(uuid) to service_role;

create or replace function public.mark_ton_deposit_rejected(
  p_chain_event_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_code text;
begin
  if p_reason not in ('bounced', 'aborted') then
    raise exception 'Unsupported TON rejection reason.';
  end if;

  update public.ton_chain_events
  set status = 'failed',
      rejection_reason = p_reason
  where id = p_chain_event_id
  returning invoice_code into v_invoice_code;

  if v_invoice_code is not null then
    update public.ton_deposit_invoices
    set status = 'rejected'
    where invoice_code = v_invoice_code
      and status in ('ready', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate');
  end if;
end;
$$;

revoke all on function public.mark_ton_deposit_rejected(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_ton_deposit_rejected(uuid, text) to service_role;

create or replace function public.settle_ton_deposit(p_chain_event_id uuid)
returns table (
  event_status text,
  credited_user_id uuid,
  usd_amount numeric,
  wallet_balance numeric,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ton_chain_events%rowtype;
  v_invoice public.ton_deposit_invoices%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_usd_amount numeric(30, 6);
  v_status text;
  v_ledger_id uuid;
begin
  select *
  into v_event
  from public.ton_chain_events
  where id = p_chain_event_id
  for update;

  if not found then
    raise exception 'TON chain event not found.';
  end if;

  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'unmatched') then
    return query select
      v_event.status,
      v_event.settlement_user_id,
      coalesce(v_event.settled_usd_amount, 0)::numeric,
      null::numeric,
      v_event.settlement_ledger_id;
    return;
  end if;

  if v_event.status <> 'finalized' then
    raise exception 'TON chain event is not finalized.';
  end if;

  if v_event.invoice_code is null or btrim(v_event.invoice_code) = '' then
    update public.ton_chain_events set status = 'unmatched' where id = v_event.id;
    perform public.complete_ton_deposit_settlement_retry(v_event.id);
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_invoice
  from public.ton_deposit_invoices
  where invoice_code = v_event.invoice_code
  for update;

  if not found then
    update public.ton_chain_events set status = 'unmatched' where id = v_event.id;
    perform public.complete_ton_deposit_settlement_retry(v_event.id);
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_event.ton_usd_rate is null then
    update public.ton_chain_events set status = 'awaiting_rate' where id = v_event.id;
    update public.ton_deposit_invoices set status = 'awaiting_rate' where id = v_invoice.id;
    return query select 'awaiting_rate'::text, v_invoice.user_id, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_wallet
  from public.wallet_accounts
  where user_id = v_invoice.user_id
  for update;

  if not found then
    raise exception 'Wallet is not created yet.';
  end if;

  v_usd_amount := round(v_event.amount_nano / 1000000000 * v_event.ton_usd_rate, 6);
  if v_usd_amount <= 0 then
    raise exception 'TON deposit is below the minimum Wallet precision.';
  end if;

  v_status := case
    when v_invoice.status in (
      'credited',
      'credited_late',
      'credited_amount_mismatch',
      'rejected',
      'cancelled',
      'expired'
    ) then 'credited_late'
    when v_invoice.expected_amount_nano is not null
      and v_invoice.expected_amount_nano <> v_event.amount_nano
      then 'credited_amount_mismatch'
    else 'credited'
  end;

  update public.wallet_accounts
  set balance = balance + v_usd_amount,
      updated_at = now()
  where user_id = v_invoice.user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (
    user_id,
    direction,
    amount,
    currency_code,
    operation_type,
    source_type,
    source_id,
    balance_after,
    idempotency_key,
    metadata
  ) values (
    v_invoice.user_id,
    'credit',
    v_usd_amount,
    v_wallet.currency_code,
    'crypto_deposit',
    'crypto_deposit',
    v_event.id,
    v_wallet.balance,
    'ton_deposit:' || v_event.id::text,
    jsonb_build_object(
      'network', v_event.network,
      'asset_code', v_event.asset_code,
      'transaction_hash', v_event.transaction_hash,
      'logical_time', v_event.logical_time,
      'amount_nano', v_event.amount_nano::text,
      'ton_usd_rate', v_event.ton_usd_rate::text,
      'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp,
      'quote_currency', 'USD',
      'credited_usd_amount', v_usd_amount::text,
      'wallet_currency_code', v_wallet.currency_code,
      'finalized_at', v_event.finalized_at,
      'invoice_code', v_event.invoice_code,
      'invoice_status', v_status
    )
  )
  returning id into v_ledger_id;

  update public.ton_chain_events
  set status = v_status,
      settled_usd_amount = v_usd_amount,
      settled_at = now(),
      settlement_user_id = v_invoice.user_id,
      settlement_ledger_id = v_ledger_id
  where id = v_event.id;

  update public.ton_deposit_invoices
  set status = v_status
  where id = v_invoice.id;

  perform public.complete_ton_deposit_settlement_retry(v_event.id);
  return query select v_status, v_invoice.user_id, v_usd_amount, v_wallet.balance, v_ledger_id;
end;
$$;

revoke all on function public.settle_ton_deposit(uuid) from public;
grant execute on function public.settle_ton_deposit(uuid) to service_role;

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
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'ton_scanner_project_url'
  limit 1;

  select decrypted_secret into v_scanner_secret
  from vault.decrypted_secrets
  where name = 'ton_scanner_secret'
  limit 1;

  if v_project_url is null or v_scanner_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/deposits/scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ton-scanner-secret', v_scanner_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_ton_deposit_scan() from public, anon, authenticated;
grant execute on function public.dispatch_ton_deposit_scan() to service_role;

create or replace function public.dispatch_ton_deposit_settlement()
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
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'ton_scanner_project_url'
  limit 1;

  select decrypted_secret into v_scanner_secret
  from vault.decrypted_secrets
  where name = 'ton_scanner_secret'
  limit 1;

  if v_project_url is null or v_scanner_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/deposits/settle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ton-scanner-secret', v_scanner_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_ton_deposit_settlement() from public, anon, authenticated;
grant execute on function public.dispatch_ton_deposit_settlement() to service_role;

create or replace function public.run_ton_deposit_pipeline()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('open-abundance-ton-deposit-pipeline'));
  perform public.dispatch_ton_deposit_scan();

  if exists (
    select 1
    from public.ton_deposit_settlement_retries
    where (
      status = 'pending'
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and locked_at < now() - interval '2 minutes'
    )
  ) then
    perform public.dispatch_ton_deposit_settlement();
  end if;
end;
$$;

revoke all on function public.run_ton_deposit_pipeline() from public, anon, authenticated;

create or replace function public.stop_ton_deposit_scan_job()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'open-abundance-ton-deposit-scan',
      'open-abundance-ton-deposit-pipeline'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

revoke all on function public.stop_ton_deposit_scan_job() from public, anon, authenticated;
grant execute on function public.stop_ton_deposit_scan_job() to service_role;

create or replace function public.schedule_ton_deposit_pipeline()
returns bigint
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_job_id bigint;
begin
  perform public.stop_ton_deposit_scan_job();
  select cron.schedule(
    'open-abundance-ton-deposit-pipeline',
    '30 seconds',
    'select public.run_ton_deposit_pipeline();'
  )
  into v_job_id;
  return v_job_id;
end;
$$;

revoke all on function public.schedule_ton_deposit_pipeline() from public, anon, authenticated;
grant execute on function public.schedule_ton_deposit_pipeline() to service_role;

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
begin
  if v_project_url !~ '^https://[^[:space:]]+$' then
    raise exception 'TON scanner project URL must be an HTTPS URL.';
  end if;
  if length(v_scanner_secret) < 32 then
    raise exception 'TON scanner secret must contain at least 32 characters.';
  end if;

  select id into v_secret_id
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

  select id into v_secret_id
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

  perform public.schedule_ton_deposit_pipeline();
end;
$$;

revoke all on function public.configure_ton_deposit_scanner(text, text) from public, anon, authenticated;
grant execute on function public.configure_ton_deposit_scanner(text, text) to service_role;

create or replace function public.ton_deposit_scanner_status()
returns table (
  job_id bigint,
  schedule text,
  active boolean,
  pending_settlements bigint,
  active_scanner_leases bigint,
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
      from public.ton_deposit_settlement_retries
      where status in ('pending', 'processing')
    ),
    (
      select count(*)
      from public.ton_chain_scan_leases
      where lease_until > now()
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
    where jobname = 'open-abundance-ton-deposit-pipeline'
    limit 1
  ) as job on singleton.seed;
$$;

revoke all on function public.ton_deposit_scanner_status() from public, anon, authenticated;
grant execute on function public.ton_deposit_scanner_status() to service_role;

insert into public.ton_deposit_settlement_retries (
  chain_event_id,
  invoice_id,
  status,
  next_attempt_at
)
select
  chain_event.id,
  invoice.id,
  'pending',
  now()
from public.ton_chain_events as chain_event
left join public.ton_deposit_invoices as invoice
  on invoice.invoice_code = chain_event.invoice_code
where chain_event.status = 'awaiting_rate'
on conflict (chain_event_id) do nothing;

select public.schedule_ton_deposit_pipeline();
