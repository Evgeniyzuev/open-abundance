-- Vercel CPU budget (Evgen, 2026-11-17: fit the free Hobby limit). The safety deposit scan, run when nobody has
-- opened a deposit screen, calls the app every 15 minutes instead of every 5 (TON and USDT: 576 -> 192 calls a day).
-- Fast 15-second scans while a person is depositing (boost_deposit_scan) or a deposit is crediting stay as they were.
CREATE OR REPLACE FUNCTION public.run_ton_deposit_pipeline()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- pg_cron ticks every 15 seconds; this is true on one tick every 15 minutes.
  v_safety_tick boolean := extract(minute from now())::int % 15 = 0 and extract(second from now()) < 15;
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
$function$;
