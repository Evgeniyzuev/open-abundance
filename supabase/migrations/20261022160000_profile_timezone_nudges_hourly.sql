-- The browser time zone on the profile, and an hourly coordinator job.
--
-- Nudges are sent in the person's daytime (10:00-19:00 local, see isNudgeSendTime), so the job now runs every hour
-- instead of once a day at 15:00 UTC. Pacing (one push per step and person, a pause between pushes, a lifetime cap)
-- lives in the app, so running it hourly does not send more; it only finds people whose morning has come.

alter table public.user_profiles
  add column if not exists timezone text check (timezone is null or char_length(timezone) <= 64);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-coordinator-nudges-daily') then
    perform cron.unschedule('open-abundance-coordinator-nudges-daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'open-abundance-coordinator-nudges-hourly') then
    perform cron.unschedule('open-abundance-coordinator-nudges-hourly');
  end if;
  perform cron.schedule(
    'open-abundance-coordinator-nudges-hourly',
    '5 * * * *',
    'select public.dispatch_coordinator_nudges();'
  );
end;
$$;
