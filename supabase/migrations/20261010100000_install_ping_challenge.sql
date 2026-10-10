-- "Install the app" challenge verified by timed push pings.
--
-- A participant enables notifications from the installed app (the subscription is flagged
-- `standalone`). The server then schedules one ping later the same day and five pings the next day,
-- all as ordinary reminder_jobs, so the existing every-minute dispatcher sends them and no new cron
-- job exists. Opening the app within 3 minutes of a ping completes the challenge. Missed pings are
-- derived on read from timestamps, so nothing runs in the background to count them.

alter table public.push_subscriptions
  add column if not exists standalone boolean not null default false;

alter table public.reminder_jobs
  add column if not exists acknowledged_at timestamptz;

alter table public.reminder_jobs drop constraint if exists reminder_jobs_kind_check;
alter table public.reminder_jobs
  add constraint reminder_jobs_kind_check check (kind in ('action', 'today_daily', 'install_ping'));

-- Rounds are numbered per user in client_reminder_id: install_ping:<round>:<index>.

create or replace function public.schedule_install_ping_round(
  p_user_id uuid,
  p_subscription_id uuid,
  p_timezone text,
  p_locale text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round integer;
  v_today date;
  v_now_local timestamp;
  v_start timestamp;
  v_end timestamp;
  v_local timestamp;
  v_id uuid;
  v_index integer;
  v_locale text := case when p_locale = 'ru' then 'ru' else 'en' end;
begin
  if not exists (
    select 1 from public.push_subscriptions
    where id = p_subscription_id
      and owner_key = 'user:' || p_user_id::text
      and enabled
      and standalone
  ) then
    raise exception 'standalone_subscription_required';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;

  -- Already confirmed once: nothing more to schedule.
  if exists (
    select 1
    from public.reminder_jobs job
    join public.push_subscriptions subscription on subscription.id = job.subscription_id
    where subscription.owner_key = 'user:' || p_user_id::text
      and job.kind = 'install_ping'
      and job.acknowledged_at is not null
  ) then
    return;
  end if;

  -- A round that is still running is left alone, so repeated taps do not add pings.
  if exists (
    select 1
    from public.reminder_jobs job
    join public.push_subscriptions subscription on subscription.id = job.subscription_id
    where subscription.owner_key = 'user:' || p_user_id::text
      and job.kind = 'install_ping'
      and job.status in ('scheduled', 'processing')
      and job.due_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  update public.reminder_jobs job
  set status = 'cancelled', updated_at = now()
  from public.push_subscriptions subscription
  where subscription.id = job.subscription_id
    and subscription.owner_key = 'user:' || p_user_id::text
    and job.kind = 'install_ping'
    and job.status = 'scheduled';

  select coalesce(max(split_part(job.client_reminder_id, ':', 2)::integer), 0) + 1
  into v_round
  from public.reminder_jobs job
  join public.push_subscriptions subscription on subscription.id = job.subscription_id
  where subscription.owner_key = 'user:' || p_user_id::text
    and job.kind = 'install_ping';

  v_now_local := now() at time zone p_timezone;
  v_today := v_now_local::date;

  -- Index 0: one ping later today between 10:00 and 21:00 local time, at least 20 minutes from now.
  v_start := greatest(v_now_local + interval '20 minutes', v_today + time '10:00');
  v_end := v_today + time '21:00';
  if v_end - v_start >= interval '10 minutes' then
    v_local := v_start + (v_end - v_start) * random();
    v_id := gen_random_uuid();
    insert into public.reminder_jobs (
      id, subscription_id, client_reminder_id, kind, locale, due_at, recurring, timezone, deep_link, status
    ) values (
      v_id, p_subscription_id, 'install_ping:' || v_round || ':0', 'install_ping', v_locale,
      v_local at time zone p_timezone, false, p_timezone, '/?install_ping=' || v_id::text, 'scheduled'
    );
  end if;

  -- Indexes 1-5: five pings tomorrow, one in each fifth of 10:00-21:00 so they spread out.
  for v_index in 1..5 loop
    v_local := (v_today + 1) + time '10:00'
      + make_interval(mins => (v_index - 1) * 132 + 10 + floor(random() * 113)::integer);
    v_id := gen_random_uuid();
    insert into public.reminder_jobs (
      id, subscription_id, client_reminder_id, kind, locale, due_at, recurring, timezone, deep_link, status
    ) values (
      v_id, p_subscription_id, 'install_ping:' || v_round || ':' || v_index, 'install_ping', v_locale,
      v_local at time zone p_timezone, false, p_timezone, '/?install_ping=' || v_id::text, 'scheduled'
    );
  end loop;
end;
$$;

create or replace function public.acknowledge_install_ping(p_user_id uuid, p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.reminder_jobs%rowtype;
begin
  select job.* into v_job
  from public.reminder_jobs job
  join public.push_subscriptions subscription on subscription.id = job.subscription_id
  where job.id = p_job_id
    and job.kind = 'install_ping'
    and subscription.owner_key = 'user:' || p_user_id::text
  for update of job;

  if not found then return 'not_found'; end if;
  if v_job.acknowledged_at is not null then return 'already'; end if;
  if v_job.status <> 'sent' then return 'not_sent'; end if;
  -- `updated_at` is set when the dispatcher records a successful send.
  if v_job.updated_at < now() - interval '3 minutes' then return 'expired'; end if;

  update public.reminder_jobs set acknowledged_at = now() where id = v_job.id;

  update public.reminder_jobs job
  set status = 'cancelled', updated_at = now()
  from public.push_subscriptions subscription
  where subscription.id = job.subscription_id
    and subscription.owner_key = 'user:' || p_user_id::text
    and job.kind = 'install_ping'
    and job.status in ('scheduled', 'processing')
    and split_part(job.client_reminder_id, ':', 2) = split_part(v_job.client_reminder_id, ':', 2);

  return 'ok';
end;
$$;

create or replace function public.install_ping_state(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_round integer;
  v_result jsonb;
begin
  select max(split_part(job.client_reminder_id, ':', 2)::integer)
  into v_round
  from public.reminder_jobs job
  join public.push_subscriptions subscription on subscription.id = job.subscription_id
  where subscription.owner_key = 'user:' || p_user_id::text
    and job.kind = 'install_ping';

  if v_round is null then
    return jsonb_build_object('status', 'none');
  end if;

  with jobs as (
    select job.*
    from public.reminder_jobs job
    join public.push_subscriptions subscription on subscription.id = job.subscription_id
    where subscription.owner_key = 'user:' || p_user_id::text
      and job.kind = 'install_ping'
      and split_part(job.client_reminder_id, ':', 2)::integer = v_round
  ),
  summary as (
    select
      bool_or(acknowledged_at is not null) as acknowledged,
      count(*) filter (where status <> 'cancelled' or acknowledged_at is not null) as planned,
      count(*) filter (where status = 'sent') as sent,
      count(*) filter (
        where (status = 'sent' and acknowledged_at is null and updated_at <= now() - interval '3 minutes')
           or (status = 'scheduled' and due_at <= now() - interval '1 hour')
           or status = 'failed'
      ) as missed,
      count(*) filter (
        where status = 'processing'
           or (status = 'scheduled' and due_at > now() - interval '1 hour')
      ) as pending,
      min(due_at) filter (where status = 'scheduled' and due_at > now()) as next_due_at
    from jobs
  ),
  open_ping as (
    select id, updated_at + interval '3 minutes' as window_ends_at
    from jobs
    where status = 'sent' and acknowledged_at is null and updated_at > now() - interval '3 minutes'
    order by updated_at desc
    limit 1
  )
  select jsonb_build_object(
    'status', case
      when summary.acknowledged then 'completed'
      when summary.pending > 0 or exists (select 1 from open_ping) then 'waiting'
      else 'failed'
    end,
    'round', v_round,
    'planned', summary.planned,
    'sent', summary.sent,
    'missed', summary.missed,
    'nextDueAt', summary.next_due_at,
    'windowEndsAt', (select window_ends_at from open_ping)
  )
  into v_result
  from summary;

  return v_result;
end;
$$;

revoke all on function public.schedule_install_ping_round(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.acknowledge_install_ping(uuid, uuid) from public, anon, authenticated;
revoke all on function public.install_ping_state(uuid) from public, anon, authenticated;
grant execute on function public.schedule_install_ping_round(uuid, uuid, text, text) to service_role;
grant execute on function public.acknowledge_install_ping(uuid, uuid) to service_role;
grant execute on function public.install_ping_state(uuid) to service_role;

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values (
  '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a03',
  '{"ru":"Установите приложение и подтвердите уведомлением","en":"Install the app and confirm with a notification"}'::jsonb,
  '{"ru":"Установите Open Abundance на телефон, включите уведомления и откройте приложение, когда оно напомнит о себе.","en":"Install Open Abundance on your phone, turn on notifications and open the app when it reminds you."}'::jsonb,
  '{"ru":"Установите приложение на главный экран и откройте его с иконки. В челлендже включите уведомления. Сегодня придёт одно уведомление, завтра до пяти в случайное время. Откройте приложение в течение 3 минут после любого из них.","en":"Add the app to your home screen and open it from the icon. Turn on notifications in the challenge. One notification arrives today and up to five tomorrow at random times. Open the app within 3 minutes of any of them."}'::jsonb,
  '{"ru":"Приложение открыто в течение 3 минут после уведомления.","en":"The app is opened within 3 minutes of a notification."}'::jsonb,
  'system', 1, 3, 'auto', 'install_ping_answered', 32, 'home', 2, 0, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    duration_days = excluded.duration_days,
    verification_type = excluded.verification_type,
    verification_logic = excluded.verification_logic,
    sort_order = excluded.sort_order,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount;
