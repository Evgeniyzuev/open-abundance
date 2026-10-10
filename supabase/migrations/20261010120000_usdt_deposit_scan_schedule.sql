-- Schedule the TON USDT deposit scanner and settlement worker.
--
-- The native TON pipeline already runs every 30 seconds, but nothing ever called the USDT
-- endpoints, so a real USDT deposit was never detected. USDT is dispatched from the same pipeline
-- job and only when there is something to do (an active invoice, or settlements waiting), so no
-- extra cron job exists and idle time costs nothing.

create or replace function public.dispatch_ton_usdt_deposit_scan()
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
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;
  select decrypted_secret into v_scanner_secret from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;
  if v_project_url is null or v_scanner_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/usdt/deposits/scan',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ton-scanner-secret', v_scanner_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.dispatch_ton_usdt_deposit_settlement()
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
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;
  select decrypted_secret into v_scanner_secret from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;
  if v_project_url is null or v_scanner_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/usdt/deposits/settle',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ton-scanner-secret', v_scanner_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.dispatch_ton_usdt_deposit_scan() from public, anon, authenticated;
revoke all on function public.dispatch_ton_usdt_deposit_settlement() from public, anon, authenticated;
grant execute on function public.dispatch_ton_usdt_deposit_scan() to service_role;
grant execute on function public.dispatch_ton_usdt_deposit_settlement() to service_role;

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

  -- USDT: scan only while someone is waiting for a deposit to arrive.
  if exists (
    select 1
    from public.ton_usdt_deposit_invoices
    where status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
      and expires_at > now()
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
