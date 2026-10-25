-- TON and USDT deposits are paid in one tap now (TON Connect), so the wait after paying is what people notice.
-- The deposit pipeline (scan, then settlement) runs every 15 seconds instead of 30; the scan routes also start the
-- settlement at once when they store a new deposit. One TON Center request per tick is well inside the API limit; the bound-sender USDT scan (first half of each minute) now runs twice a minute.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-ton-deposit-pipeline') then
    perform cron.unschedule('open-abundance-ton-deposit-pipeline');
  end if;
  perform cron.schedule('open-abundance-ton-deposit-pipeline', '15 seconds', 'select public.run_ton_deposit_pipeline();');
end;
$$;
