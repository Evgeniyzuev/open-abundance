-- Scan USDT deposits for people who have a bound sender address, not only while an invoice is waiting.
--
-- A person with a bound address pays without an invoice (no comment, any amount), so no invoice is
-- "waiting" when the money arrives and the scanner was never started: the deposit sat on chain unseen
-- until some invoice happened to be active. The pipeline now also scans USDT once a minute while at
-- least one sender is bound. The pipeline runs every 30 seconds; scanning on the ticks that fall in the
-- first half of a minute gives exactly one scan a minute and costs one TON Center request.
--
-- Everything else in the pipeline is unchanged: native TON scan and settlement, the invoice-driven
-- USDT scan (every tick) and the USDT settlement worker.

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

  -- USDT: scan while someone is waiting for a deposit to arrive, and once a minute while any sender is
  -- bound (a bound sender pays without an invoice).
  if exists (
    select 1
    from public.ton_usdt_deposit_invoices
    where status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
      and expires_at > now()
  ) or (
    extract(second from now()) < 30
    and exists (select 1 from public.ton_usdt_bound_senders)
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
