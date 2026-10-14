-- Daily Trust shadow snapshot for the owner's private reputation summary.
-- Once a day: rebuild trust-shadow-v2 (which also rebuilds its base trust-shadow-v1) for the UTC date and
-- drop shadow rows older than 30 days, so the tables do not grow without bound. v2 reads the rater's Trust from
-- the latest earlier snapshot, which is always kept (yesterday's).

create or replace function public.run_daily_trust_shadow()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
begin
  perform public.rebuild_trust_v2_shadow('trust-shadow-v2', v_today);
  delete from public.trust_v2_shadow_contributions where as_of_date < v_today - 30;
  delete from public.trust_v2_shadow_summaries where as_of_date < v_today - 30;
end;
$$;

revoke all on function public.run_daily_trust_shadow() from public, anon, authenticated;
grant execute on function public.run_daily_trust_shadow() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-trust-shadow-daily') then
    perform cron.unschedule('open-abundance-trust-shadow-daily');
  end if;
  perform cron.schedule(
    'open-abundance-trust-shadow-daily',
    '20 3 * * *',
    'select public.run_daily_trust_shadow();'
  );
end;
$$;
