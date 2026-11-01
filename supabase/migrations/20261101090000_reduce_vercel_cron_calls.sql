-- Vercel Hobby counts Active CPU of every function call. pg_cron called the app ~10-13 thousand times a day, mostly
-- with nothing to do: the TON scan every 15 seconds, the USDT scan twice a minute (and every 15 seconds for 30 days
-- while a sender-binding invoice was open), the withdrawal reconciliation every minute.
-- Now the fast 15-second pace runs only while someone is actually paying:
--   * the deposit modal and TON Connect call boost_deposit_scan() (fast pace for 10 minutes after the last call);
--   * a deposit is already detected and not yet credited.
-- Otherwise each scan runs once every 5 minutes as a safety net. Scans are cursor based, so nothing is missed,
-- a payment made without the app open is credited within ~5 minutes instead of ~15 seconds.
-- The withdrawal reconciliation is called only when a withdrawal is waiting for it, the treasury check hourly.

create table if not exists public.deposit_scan_boosts (
  asset_code text primary key check (asset_code in ('TON', 'USDT')),
  boosted_until timestamptz not null default now()
);

alter table public.deposit_scan_boosts enable row level security;
revoke all on table public.deposit_scan_boosts from public, anon, authenticated;
grant select, insert, update, delete on table public.deposit_scan_boosts to service_role;

create or replace function public.boost_deposit_scan(p_asset text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_asset not in ('TON', 'USDT') then
    return;
  end if;
  insert into public.deposit_scan_boosts (asset_code, boosted_until)
  values (p_asset, now() + interval '10 minutes')
  on conflict (asset_code) do update set boosted_until = excluded.boosted_until;
end;
$$;
revoke all on function public.boost_deposit_scan(text) from public, anon;
grant execute on function public.boost_deposit_scan(text) to authenticated, service_role;

create or replace function public.run_ton_deposit_pipeline()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- pg_cron ticks every 15 seconds; this is true on one tick every 5 minutes.
  v_safety_tick boolean := extract(minute from now())::int % 5 = 0 and extract(second from now()) < 15;
  v_ton_fast boolean;
  v_usdt_fast boolean;
begin
  perform pg_advisory_xact_lock(hashtext('open-abundance-ton-deposit-pipeline'));

  v_ton_fast := exists (
    select 1 from public.deposit_scan_boosts where asset_code = 'TON' and boosted_until > now()
  ) or exists (
    select 1
    from public.ton_deposit_invoices
    where status in ('detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
      and updated_at > now() - interval '1 hour'
  );

  if v_ton_fast or v_safety_tick then
    perform public.dispatch_ton_deposit_scan();
  end if;

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

  v_usdt_fast := exists (
    select 1 from public.deposit_scan_boosts where asset_code = 'USDT' and boosted_until > now()
  ) or exists (
    select 1
    from public.ton_usdt_deposit_invoices
    where status in ('detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
      and expires_at > now()
      and updated_at > now() - interval '1 hour'
  );

  if v_usdt_fast or (
    v_safety_tick
    and (
      exists (
        select 1
        from public.ton_usdt_deposit_invoices
        where status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
          and expires_at > now()
      )
      or exists (select 1 from public.ton_usdt_bound_senders)
    )
  ) then
    perform public.dispatch_ton_usdt_deposit_scan();
  end if;

  if exists (
    select 1
    from public.ton_usdt_deposit_settlement_retries
    where (
      status = 'pending'
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and locked_at < now() - interval '2 minutes'
    )
  ) then
    perform public.dispatch_ton_usdt_deposit_settlement();
  end if;
end;
$$;
revoke all on function public.run_ton_deposit_pipeline() from public, anon, authenticated;

-- Mirrors loadCandidates() in lib/withdrawalReconciler.ts: call the app only when it has something to check.
create or replace function public.dispatch_withdrawal_reconciliation()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url text;
  v_secret text;
  v_request_id bigint;
  v_recheck_minute boolean := extract(minute from now())::int % 10 = 0;
begin
  if not exists (
    select 1 from public.ton_withdrawals
    where status = 'broadcast'
      or (status = 'broadcasting' and coalesce(broadcast_at, created_at) < now() - interval '10 minutes')
      or (status = 'manual_review' and (error_code = 'broadcast_unknown' or (error_code = 'reconcile_unresolved' and v_recheck_minute)))
  ) and not exists (
    select 1 from public.ton_usdt_withdrawals
    where status = 'broadcast'
      or (status = 'broadcasting' and coalesce(broadcast_at, created_at) < now() - interval '10 minutes')
      or (status = 'manual_review' and (error_code = 'broadcast_unknown' or (error_code = 'reconcile_unresolved' and v_recheck_minute)))
  ) then
    return null;
  end if;

  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;
  if v_project_url is null or v_secret is null then
    raise exception 'Withdrawal reconciliation Vault configuration is missing.';
  end if;
  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/withdrawals/reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ton-scanner-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.dispatch_withdrawal_reconciliation() from public, anon, authenticated;
grant execute on function public.dispatch_withdrawal_reconciliation() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-treasury-coverage-check') then
    perform cron.unschedule('open-abundance-treasury-coverage-check');
  end if;
  perform cron.schedule(
    'open-abundance-treasury-coverage-check',
    '7 * * * *',
    'select public.dispatch_treasury_coverage_check();'
  );
end;
$$;
