-- Daily "next step" pushes from the coordinator. Once a day pg_cron asks the app to find people
-- stuck on a basic step (wish, Core calculator, first challenge, invitation) and queue one push
-- each. The app decides who, how often and what to say; it sends only when the environment
-- variable COORDINATOR_NUDGES_ENABLED=1 is set. Reuses the Vault entries and shared secret of the
-- TON scanner, like the treasury coverage check.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_coordinator_nudges()
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
    raise exception 'Coordinator nudges Vault configuration is missing.';
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/coordinator/nudges',
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

revoke all on function public.dispatch_coordinator_nudges() from public, anon, authenticated;
grant execute on function public.dispatch_coordinator_nudges() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-coordinator-nudges-daily') then
    perform cron.unschedule('open-abundance-coordinator-nudges-daily');
  end if;
  -- 15:00 UTC is early evening for most of the pilot.
  perform cron.schedule(
    'open-abundance-coordinator-nudges-daily',
    '0 15 * * *',
    'select public.dispatch_coordinator_nudges();'
  );
end;
$$;
