create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz
);

create table if not exists public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  client_reminder_id text not null,
  kind text not null check (kind in ('action', 'inbox_review')),
  locale text not null default 'en' check (locale in ('ru', 'en')),
  due_at timestamptz not null,
  recurring boolean not null default false,
  local_time time,
  timezone text not null default 'UTC',
  deep_link text not null default '/',
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, client_reminder_id)
);

create index if not exists reminder_jobs_due_idx
  on public.reminder_jobs (due_at)
  where status = 'scheduled';

alter table public.push_subscriptions enable row level security;
alter table public.reminder_jobs enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.reminder_jobs from anon, authenticated;

create or replace function public.claim_due_reminder_jobs(p_limit integer default 100)
returns setof public.reminder_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.reminder_jobs jobs
  set status = 'processing',
      attempts = jobs.attempts + 1,
      updated_at = now()
  where jobs.id in (
    select due.id
    from public.reminder_jobs due
    join public.push_subscriptions subscription on subscription.id = due.subscription_id
    where due.status = 'scheduled'
      and due.due_at <= now()
      and subscription.enabled
    order by due.due_at
    for update of due skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  returning jobs.*;
end;
$$;

create or replace function public.complete_reminder_job(
  p_job_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_job public.reminder_jobs%rowtype;
begin
  select * into current_job
  from public.reminder_jobs
  where id = p_job_id
  for update;

  if current_job.id is null then
    return;
  end if;

  if p_success and current_job.recurring then
    update public.reminder_jobs
    set status = 'scheduled',
        due_at = (((now() at time zone current_job.timezone)::date + 1) + coalesce(current_job.local_time, time '19:00')) at time zone current_job.timezone,
        last_error = null,
        updated_at = now()
    where id = p_job_id;
  elsif p_success then
    update public.reminder_jobs
    set status = 'sent', last_error = null, updated_at = now()
    where id = p_job_id;
  elsif current_job.attempts < 3 then
    update public.reminder_jobs
    set status = 'scheduled', due_at = now() + interval '5 minutes', last_error = left(p_error, 500), updated_at = now()
    where id = p_job_id;
  else
    update public.reminder_jobs
    set status = 'failed', last_error = left(p_error, 500), updated_at = now()
    where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.claim_due_reminder_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_reminder_job(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_due_reminder_jobs(integer) to service_role;
grant execute on function public.complete_reminder_job(uuid, boolean, text) to service_role;

create or replace function public.invoke_reflection_reminder_dispatch()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  project_url text;
  cron_secret text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'reflection_reminder_cron_secret'
  limit 1;

  if project_url is null or cron_secret is null then
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-reflection-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.invoke_reflection_reminder_dispatch() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-reflection-reminders') then
    perform cron.unschedule('open-abundance-reflection-reminders');
  end if;
end;
$$;

select cron.schedule(
  'open-abundance-reflection-reminders',
  '* * * * *',
  $$select public.invoke_reflection_reminder_dispatch();$$
);
