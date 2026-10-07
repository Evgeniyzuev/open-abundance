-- Periodic treasury coverage check. Every 15 minutes pg_cron asks the app to build the
-- coverage report and notify Growth Operators when the light is yellow, red or unknown.
-- The call reuses the existing Vault entries and shared secret of the TON scanner.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.treasury_coverage_state (
  id boolean primary key default true check (id),
  last_light text,
  last_ratio numeric,
  last_checked_at timestamptz,
  last_notified_light text,
  last_notified_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.treasury_coverage_state (id) values (true) on conflict (id) do nothing;

alter table public.treasury_coverage_state enable row level security;
revoke all on public.treasury_coverage_state from public, anon, authenticated;
grant select, insert, update on public.treasury_coverage_state to service_role;

create or replace function public.dispatch_treasury_coverage_check()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;

  if v_project_url is null or v_secret is null then
    raise exception 'Treasury coverage check Vault configuration is missing.';
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/treasury/check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ton-scanner-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_treasury_coverage_check() from public, anon, authenticated;
grant execute on function public.dispatch_treasury_coverage_check() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-treasury-coverage-check') then
    perform cron.unschedule('open-abundance-treasury-coverage-check');
  end if;
  perform cron.schedule(
    'open-abundance-treasury-coverage-check',
    '*/15 * * * *',
    'select public.dispatch_treasury_coverage_check();'
  );
end;
$$;
