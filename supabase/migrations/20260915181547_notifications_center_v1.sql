create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  category text not null check (category in ('deals', 'disputes', 'wallet', 'rewards', 'team', 'confirmations', 'reminders', 'system')),
  source_type text not null check (char_length(source_type) between 1 and 80),
  source_id text,
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 500),
  deep_link text not null default '/' check (deep_link like '/%' and deep_link not like '//%'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('deals', 'disputes', 'wallet', 'rewards', 'team', 'confirmations', 'reminders', 'system')),
  in_app_enabled boolean not null default true,
  constraint notification_preferences_required_history_check
    check (category not in ('deals', 'disputes', 'wallet', 'rewards', 'system') or in_app_enabled),
  push_enabled boolean not null default true,
  locale text not null default 'en' check (locale in ('ru', 'en')),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.push_subscriptions
  add column if not exists device_label text,
  add column if not exists last_seen_at timestamptz not null default now();

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_id, subscription_id)
);

create index notification_recipients_user_created_idx
  on public.notification_recipients (user_id, created_at desc, id desc);
create index notification_recipients_user_unread_idx
  on public.notification_recipients (user_id, created_at desc)
  where read_at is null;
create index notification_deliveries_queue_idx
  on public.notification_deliveries (available_at, created_at)
  where status = 'queued';
create index notification_deliveries_processing_idx
  on public.notification_deliveries (claimed_at)
  where status = 'processing';

alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

create policy notification_events_recipient_select on public.notification_events
  for select to authenticated
  using (exists (
    select 1
    from public.notification_recipients recipient
    where recipient.event_id = notification_events.id
      and recipient.user_id = (select auth.uid())
  ));

create policy notification_recipients_owner_select on public.notification_recipients
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_recipients_owner_update on public.notification_recipients
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notification_preferences_owner_all on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notification_events from anon, authenticated;
revoke all on public.notification_recipients from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_events to authenticated;
grant select on public.notification_recipients to authenticated;
grant update (read_at) on public.notification_recipients to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create or replace function public.create_notification_event(
  p_event_type text,
  p_category text,
  p_source_type text,
  p_source_id text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_recipient_user_ids uuid[],
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_event_id uuid;
begin
  if coalesce(array_length(p_recipient_user_ids, 1), 0) = 0 then
    raise exception 'At least one notification recipient is required.';
  end if;

  insert into public.notification_events (
    event_type, category, source_type, source_id, title, body, deep_link, metadata, idempotency_key
  ) values (
    p_event_type, p_category, p_source_type, nullif(btrim(p_source_id), ''),
    p_title, p_body, p_deep_link, coalesce(p_metadata, '{}'::jsonb), p_idempotency_key
  )
  on conflict (idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into created_event_id;

  insert into public.notification_recipients (event_id, user_id)
  select created_event_id, recipient_user_id
  from unnest(p_recipient_user_ids) recipient_user_id
  where recipient_user_id is not null
  on conflict (event_id, user_id) do nothing;

  insert into public.notification_deliveries (recipient_id, subscription_id)
  select recipient.id, subscription.id
  from public.notification_recipients recipient
  join public.notification_events event on event.id = recipient.event_id
  join public.push_subscriptions subscription
    on subscription.owner_key = 'user:' || recipient.user_id::text
   and subscription.enabled
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
   and preference.category = event.category
  where recipient.event_id = created_event_id
    and coalesce(preference.push_enabled, true)
  on conflict (recipient_id, subscription_id) do nothing;

  return created_event_id;
end;
$$;

create or replace function public.notification_source_accessible(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_event public.notification_events%rowtype;
begin
  select * into source_event from public.notification_events where id = p_event_id;
  if not found then return false; end if;
  if source_event.source_type not in ('p2p_order', 'team_task', 'mutual_confirmation', 'user_challenge', 'team_core_growth_reward') then
    return true;
  end if;
  if source_event.source_id is null or source_event.source_id !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  if source_event.source_type = 'p2p_order' then
    return exists (select 1 from public.p2p_orders where id = source_event.source_id::uuid and p_user_id in (buyer_user_id, seller_user_id));
  elsif source_event.source_type = 'team_task' then
    return exists (select 1 from public.team_tasks where id = source_event.source_id::uuid and p_user_id in (leader_user_id, member_user_id));
  elsif source_event.source_type = 'mutual_confirmation' then
    return exists (select 1 from public.mutual_confirmations where id = source_event.source_id::uuid and p_user_id in (requester_user_id, counterparty_user_id));
  elsif source_event.source_type = 'user_challenge' then
    return exists (select 1 from public.user_challenges where id = source_event.source_id::uuid and user_id = p_user_id);
  else
    return exists (select 1 from public.team_core_growth_rewards where id = source_event.source_id::uuid and leader_user_id = p_user_id);
  end if;
end;
$$;

create or replace function public.claim_notification_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  locale text,
  event_type text,
  category text,
  deep_link text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries
  set status = 'queued',
      claimed_at = null,
      available_at = now(),
      updated_at = now(),
      last_error = 'Recovered after processing timeout'
  where status = 'processing'
    and claimed_at < now() - interval '10 minutes';

  return query
  with claimed as (
    select delivery.id
    from public.notification_deliveries delivery
    join public.notification_recipients recipient on recipient.id = delivery.recipient_id
    join public.notification_events event on event.id = recipient.event_id
    join public.push_subscriptions subscription on subscription.id = delivery.subscription_id
    left join public.notification_preferences preference
      on preference.user_id = recipient.user_id
     and preference.category = event.category
    where delivery.status = 'queued'
      and delivery.available_at <= now()
      and subscription.enabled
      and subscription.owner_key = 'user:' || recipient.user_id::text
      and coalesce(preference.push_enabled, true)
      and public.notification_source_accessible(event.id, recipient.user_id)
    order by delivery.available_at, delivery.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update of delivery skip locked
  ), updated as (
    update public.notification_deliveries delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        claimed_at = now(),
        updated_at = now()
    from claimed
    where delivery.id = claimed.id
    returning delivery.*
  )
  select updated.id,
         subscription.id,
         subscription.endpoint,
         subscription.p256dh,
         subscription.auth,
         coalesce(preference.locale, 'en'),
         event.event_type,
         event.category,
         event.deep_link
  from updated
  join public.notification_recipients recipient on recipient.id = updated.recipient_id
  join public.notification_events event on event.id = recipient.event_id
  join public.push_subscriptions subscription on subscription.id = updated.subscription_id
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
   and preference.category = event.category;

  update public.notification_deliveries delivery
  set status = 'cancelled', updated_at = now(), last_error = 'Subscription owner or preference changed'
  from public.notification_recipients recipient,
       public.notification_events event,
       public.push_subscriptions subscription
  where delivery.status = 'queued'
    and delivery.recipient_id = recipient.id
    and event.id = recipient.event_id
    and subscription.id = delivery.subscription_id
    and (subscription.enabled = false
      or subscription.owner_key <> 'user:' || recipient.user_id::text
      or not public.notification_source_accessible(event.id, recipient.user_id)
      or exists (
        select 1 from public.notification_preferences disabled
        where disabled.user_id = recipient.user_id
          and disabled.category = event.category
          and disabled.push_enabled = false
      ));
end;
$$;

create or replace function public.notification_delivery_allowed(p_delivery_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notification_deliveries delivery
    join public.notification_recipients recipient on recipient.id = delivery.recipient_id
    join public.notification_events event on event.id = recipient.event_id
    join public.push_subscriptions subscription on subscription.id = delivery.subscription_id
    left join public.notification_preferences preference
      on preference.user_id = recipient.user_id and preference.category = event.category
    where delivery.id = p_delivery_id
      and delivery.status = 'processing'
      and subscription.enabled
      and subscription.owner_key = 'user:' || recipient.user_id::text
      and coalesce(preference.push_enabled, true)
      and public.notification_source_accessible(event.id, recipient.user_id)
  );
$$;

create or replace function public.notification_unread_count(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*)
  from public.notification_recipients recipient
  join public.notification_events event on event.id = recipient.event_id
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id and preference.category = event.category
  where recipient.user_id = p_user_id
    and recipient.read_at is null
    and coalesce(preference.in_app_enabled, true);
$$;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_delivery public.notification_deliveries%rowtype;
begin
  select * into current_delivery
  from public.notification_deliveries
  where id = p_delivery_id
  for update;

  if current_delivery.id is null or current_delivery.status <> 'processing' then
    return;
  end if;

  if p_success then
    update public.notification_deliveries
    set status = 'sent', sent_at = now(), last_error = null, updated_at = now()
    where id = p_delivery_id;
  elsif current_delivery.attempts < 4 then
    update public.notification_deliveries
    set status = 'queued',
        available_at = now() + make_interval(mins => case current_delivery.attempts when 1 then 1 when 2 then 5 else 15 end),
        claimed_at = null,
        last_error = left(p_error, 500),
        updated_at = now()
    where id = p_delivery_id;
  else
    update public.notification_deliveries
    set status = 'failed', last_error = left(p_error, 500), updated_at = now()
    where id = p_delivery_id;
  end if;
end;
$$;

create or replace function public.notify_wallet_ledger_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_notification_event(
    'wallet.' || new.operation_type,
    'wallet',
    new.source_type,
    coalesce(new.source_id::text, new.id::text),
    'Wallet updated',
    'A Wallet operation was recorded.',
    '/?view=wallet.wallet',
    array[new.user_id],
    'wallet-ledger:' || new.id,
    jsonb_build_object('direction', new.direction, 'operationType', new.operation_type)
  );
  return new;
end;
$$;
drop trigger if exists notify_wallet_ledger_insert on public.wallet_ledger;
create trigger notify_wallet_ledger_insert after insert on public.wallet_ledger
for each row execute function public.notify_wallet_ledger_insert();

create or replace function public.notify_daily_core_accrual_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_notification_event(
    'rewards.daily_core_accrual', 'rewards', 'daily_core_accrual',
    new.accrual_date::text || ':' || new.user_id::text,
    'Daily Core accrual recorded', 'Open your balance to see the details.',
    '/?view=wallet.core', array[new.user_id],
    'daily-core-accrual:' || new.accrual_date::text || ':' || new.user_id::text,
    '{}'::jsonb
  );
  return new;
end;
$$;
drop trigger if exists notify_daily_core_accrual_insert on public.daily_core_accruals;
create trigger notify_daily_core_accrual_insert after insert on public.daily_core_accruals
for each row execute function public.notify_daily_core_accrual_insert();

create or replace function public.notify_team_reward_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_notification_event(
    'rewards.team_core_growth', 'rewards', 'team_core_growth_reward', new.id::text,
    'Team reward recorded', 'Open your activity to see the details.',
    '/?view=people.profile', array[new.leader_user_id],
    'team-core-growth-reward:' || new.id, '{}'::jsonb
  );
  return new;
end;
$$;
drop trigger if exists notify_team_reward_insert on public.team_core_growth_rewards;
create trigger notify_team_reward_insert after insert on public.team_core_growth_rewards
for each row execute function public.notify_team_reward_insert();

create or replace function public.notify_mutual_confirmation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  next_type text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    recipient_id := new.counterparty_user_id;
    next_type := 'confirmations.requested';
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    recipient_id := new.requester_user_id;
    next_type := 'confirmations.' || new.status;
  else
    return new;
  end if;
  perform public.create_notification_event(
    next_type, 'confirmations', 'mutual_confirmation', new.id::text,
    'Confirmation updated', 'Open confirmations to see the details.',
    '/?view=people.people', array[recipient_id],
    'mutual-confirmation:' || new.id || ':' || new.status, '{}'::jsonb
  );
  return new;
end;
$$;
drop trigger if exists notify_mutual_confirmation_change on public.mutual_confirmations;
create trigger notify_mutual_confirmation_change after insert or update of status on public.mutual_confirmations
for each row execute function public.notify_mutual_confirmation_change();

create or replace function public.notify_challenge_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform public.create_notification_event(
      'rewards.challenge_completed', 'rewards', 'user_challenge', new.id::text,
      'Challenge completed', 'Your challenge result and reward are ready.',
      '/?view=challenges', array[new.user_id],
      'challenge-completed:' || new.id, jsonb_build_object('challengeId', new.challenge_id)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists notify_challenge_completion on public.user_challenges;
create trigger notify_challenge_completion after update of status on public.user_challenges
for each row execute function public.notify_challenge_completion();

create or replace function public.notify_team_task_event_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.team_tasks%rowtype;
  recipient_id uuid;
begin
  select * into task from public.team_tasks where id = new.task_id;
  recipient_id := case when new.actor_user_id = task.leader_user_id then task.member_user_id else task.leader_user_id end;
  perform public.create_notification_event(
    'team.task.' || new.event_type, 'team', 'team_task', new.task_id::text,
    'Team task updated', 'Open the team task to see the next step.',
    '/?view=people.teams', array[recipient_id],
    'team-task-event:' || new.id, jsonb_build_object('eventType', new.event_type)
  );
  return new;
end;
$$;
drop trigger if exists notify_team_task_event_insert on public.team_task_events;
create trigger notify_team_task_event_insert after insert on public.team_task_events
for each row execute function public.notify_team_task_event_insert();

revoke all on function public.create_notification_event(text, text, text, text, text, text, text, uuid[], text, jsonb) from public, anon, authenticated;
revoke all on function public.notification_source_accessible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.notification_delivery_allowed(uuid) from public, anon, authenticated;
revoke all on function public.notification_unread_count(uuid) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.notify_wallet_ledger_insert() from public, anon, authenticated;
revoke all on function public.notify_daily_core_accrual_insert() from public, anon, authenticated;
revoke all on function public.notify_team_reward_insert() from public, anon, authenticated;
revoke all on function public.notify_mutual_confirmation_change() from public, anon, authenticated;
revoke all on function public.notify_challenge_completion() from public, anon, authenticated;
revoke all on function public.notify_team_task_event_insert() from public, anon, authenticated;
grant execute on function public.create_notification_event(text, text, text, text, text, text, text, uuid[], text, jsonb) to service_role;
grant execute on function public.notification_source_accessible(uuid, uuid) to service_role;
grant execute on function public.claim_notification_deliveries(integer) to service_role;
grant execute on function public.notification_delivery_allowed(uuid) to service_role;
grant execute on function public.notification_unread_count(uuid) to service_role;
grant execute on function public.complete_notification_delivery(uuid, boolean, text) to service_role;
