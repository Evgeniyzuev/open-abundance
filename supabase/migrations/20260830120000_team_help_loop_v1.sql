-- Team Help Loop v1: role-scoped tasks, immutable task events and quality referrals.

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  leader_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete restrict,
  task_kind text not null default 'manual' check (task_kind in ('manual', 'challenge')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  due_at timestamptz,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'submitted', 'completed', 'returned', 'declined', 'cancelled')),
  submission text check (submission is null or char_length(submission) <= 4000),
  newcomer_eligible boolean not null default false,
  version integer not null default 1 check (version > 0),
  accepted_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_tasks_kind_challenge_check check (
    (task_kind = 'challenge' and challenge_id is not null)
    or (task_kind = 'manual' and challenge_id is null)
  ),
  constraint team_tasks_not_self_check check (leader_user_id <> member_user_id)
);

create index if not exists team_tasks_member_status_updated_idx
  on public.team_tasks (member_user_id, status, updated_at desc);
create index if not exists team_tasks_leader_status_due_idx
  on public.team_tasks (leader_user_id, status, due_at nulls last, updated_at desc);
create index if not exists team_tasks_challenge_member_status_idx
  on public.team_tasks (challenge_id, member_user_id, status)
  where challenge_id is not null;

create table if not exists public.team_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'accepted', 'submitted', 'completed', 'returned', 'declined', 'cancelled', 'challenge_completed')),
  from_status text,
  to_status text not null,
  task_version integer not null check (task_version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (task_id, task_version)
);

create index if not exists team_task_events_task_created_idx
  on public.team_task_events (task_id, created_at desc);
create index if not exists team_task_events_actor_created_idx
  on public.team_task_events (actor_user_id, created_at desc);

alter table public.team_tasks enable row level security;
alter table public.team_task_events enable row level security;

revoke all on table public.team_tasks from public, anon, authenticated;
revoke all on table public.team_task_events from public, anon, authenticated;
grant select on table public.team_tasks to authenticated;
grant select on table public.team_task_events to authenticated;
grant select on table public.team_tasks to service_role;
grant select on table public.team_task_events to service_role;
revoke insert, update, delete on table public.team_tasks from service_role;
revoke insert, update, delete on table public.team_task_events from service_role;

create or replace function public.prevent_team_task_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Team task events are immutable.' using errcode = '55000';
end;
$$;

drop trigger if exists prevent_team_task_event_update on public.team_task_events;
create trigger prevent_team_task_event_update
before update or delete on public.team_task_events
for each row execute function public.prevent_team_task_event_mutation();

revoke all on function public.prevent_team_task_event_mutation() from public, anon, authenticated;

drop policy if exists "Team participants can read tasks" on public.team_tasks;
create policy "Team participants can read tasks"
on public.team_tasks
for select
to authenticated
using ((select auth.uid()) in (leader_user_id, member_user_id));

drop policy if exists "Team participants can read task events" on public.team_task_events;
create policy "Team participants can read task events"
on public.team_task_events
for select
to authenticated
using (exists (
  select 1
  from public.team_tasks task
  where task.id = team_task_events.task_id
    and (select auth.uid()) in (task.leader_user_id, task.member_user_id)
));

drop trigger if exists touch_team_tasks_updated_at on public.team_tasks;
create trigger touch_team_tasks_updated_at
before update on public.team_tasks
for each row execute function public.touch_updated_at();

create or replace function public.create_team_task(
  p_actor_user_id uuid,
  p_member_user_id uuid,
  p_task_kind text,
  p_title text,
  p_description text default '',
  p_due_at timestamptz default null,
  p_challenge_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.team_tasks%rowtype;
  v_member_created_at timestamptz;
  v_challenge_status text;
  v_challenge_logic text;
begin
  if p_actor_user_id is null or p_member_user_id is null or p_actor_user_id = p_member_user_id then
    raise exception 'A leader and a different member are required.' using errcode = '22023';
  end if;

  if p_task_kind not in ('manual', 'challenge') then
    raise exception 'Unsupported team task kind.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'Task title must be between 1 and 160 characters.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_description, '')) > 4000 then
    raise exception 'Task description is too long.' using errcode = '22023';
  end if;

  if p_task_kind = 'challenge' and p_challenge_id is null then
    raise exception 'A challenge task requires a challenge.' using errcode = '22023';
  end if;
  if p_task_kind = 'manual' and p_challenge_id is not null then
    raise exception 'A manual task cannot reference a challenge.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.team_memberships membership
    where membership.member_user_id = p_member_user_id
      and membership.leader_user_id = p_actor_user_id
      and membership.is_active
  ) then
    raise exception 'Only the current direct leader can assign tasks.' using errcode = '42501';
  end if;

  if p_challenge_id is not null then
    select verification_logic into v_challenge_logic
    from public.challenges challenge
    where challenge.id = p_challenge_id and challenge.is_active;
    if not found then
      raise exception 'Challenge not found.' using errcode = '22023';
    end if;
    if v_challenge_logic = 'team_task_help_completed' then
      raise exception 'The leader help challenge cannot be assigned to a member.' using errcode = '22023';
    end if;
  end if;

  select coalesce(profile.created_at, auth_user.created_at) into v_member_created_at
  from auth.users auth_user
  left join public.user_profiles profile on profile.user_id = auth_user.id
  where auth_user.id = p_member_user_id;

  insert into public.team_tasks (
    leader_user_id,
    member_user_id,
    challenge_id,
    task_kind,
    title,
    description,
    due_at,
    newcomer_eligible
  ) values (
    p_actor_user_id,
    p_member_user_id,
    p_challenge_id,
    p_task_kind,
    btrim(p_title),
    coalesce(p_description, ''),
    p_due_at,
    coalesce(v_member_created_at >= now() - interval '7 days', false)
  ) returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, to_status, task_version)
  values (v_task.id, p_actor_user_id, 'created', v_task.status, v_task.version);

  if p_task_kind = 'challenge' then
    insert into public.user_challenges (user_id, challenge_id, status, updated_at)
    values (p_member_user_id, p_challenge_id, 'accepted', now())
    on conflict (user_id, challenge_id) do update
      set status = 'accepted',
          updated_at = excluded.updated_at
      where public.user_challenges.status <> 'completed';

    select status into v_challenge_status
    from public.user_challenges
    where user_id = p_member_user_id and challenge_id = p_challenge_id;

    if v_challenge_status = 'completed' then
      update public.team_tasks
      set status = 'completed',
          accepted_at = coalesce(accepted_at, now()),
          completed_at = now(),
          version = version + 1,
          updated_at = now()
      where id = v_task.id
      returning * into v_task;

      insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version)
      values (v_task.id, p_member_user_id, 'challenge_completed', 'proposed', v_task.status, v_task.version);
    end if;
  end if;

  return to_jsonb(v_task);
end;
$$;

create or replace function public.transition_team_task(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_action text,
  p_expected_version integer default null,
  p_submission text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.team_tasks%rowtype;
  v_next_status text;
  v_event_type text;
  v_previous_status text;
  v_is_leader boolean;
  v_is_member boolean;
  v_idempotent boolean := false;
begin
  select * into v_task
  from public.team_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Team task not found.' using errcode = 'P0002';
  end if;

  v_is_leader := p_actor_user_id = v_task.leader_user_id;
  v_is_member := p_actor_user_id = v_task.member_user_id;
  if not v_is_leader and not v_is_member then
    raise exception 'You are not a participant in this task.' using errcode = '42501';
  end if;

  v_idempotent := (p_action = 'accept' and v_task.status = 'accepted')
    or (p_action = 'submit' and v_task.status = 'submitted')
    or (p_action = 'complete' and v_task.status = 'completed')
    or (p_action = 'return' and v_task.status = 'returned')
    or (p_action = 'decline' and v_task.status = 'declined')
    or (p_action = 'cancel' and v_task.status = 'cancelled');
  if v_idempotent then
    return jsonb_build_object('task', to_jsonb(v_task), 'idempotent', true);
  end if;

  if p_expected_version is not null and p_expected_version <> v_task.version then
    raise exception 'Team task changed. Refresh and try again.' using errcode = '40001';
  end if;

  if p_action = 'accept' and v_is_member and v_task.status = 'proposed' then
    v_next_status := 'accepted';
    v_event_type := 'accepted';
  elsif p_action = 'decline' and v_is_member and v_task.status = 'proposed' then
    v_next_status := 'declined';
    v_event_type := 'declined';
  elsif p_action = 'submit' and v_is_member and v_task.status in ('accepted', 'returned') then
    if v_task.task_kind = 'challenge' then
      raise exception 'Challenge tasks complete from the linked challenge.' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_submission, ''))) = 0 or char_length(p_submission) > 4000 then
      raise exception 'A submission between 1 and 4000 characters is required.' using errcode = '22023';
    end if;
    v_next_status := 'submitted';
    v_event_type := 'submitted';
  elsif p_action = 'complete' and v_is_leader and v_task.status = 'submitted' then
    v_next_status := 'completed';
    v_event_type := 'completed';
  elsif p_action = 'return' and v_is_leader and v_task.status = 'submitted' then
    v_next_status := 'returned';
    v_event_type := 'returned';
  elsif p_action = 'cancel' and v_is_leader and v_task.status in ('proposed', 'accepted', 'submitted', 'returned') then
    v_next_status := 'cancelled';
    v_event_type := 'cancelled';
  else
    raise exception 'This task action is not available in its current state.' using errcode = '22023';
  end if;

  v_previous_status := v_task.status;

  update public.team_tasks
  set status = v_next_status,
      submission = case when p_action = 'submit' then btrim(p_submission) else submission end,
      accepted_at = case when v_next_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
      submitted_at = case when v_next_status = 'submitted' then now() else submitted_at end,
      completed_at = case when v_next_status = 'completed' then now() else completed_at end,
      version = version + 1,
      updated_at = now()
  where id = v_task.id
  returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
  values (
    v_task.id,
    p_actor_user_id,
    v_event_type,
    v_previous_status,
    v_task.status,
    v_task.version,
    case when p_action = 'submit' then jsonb_build_object('submission', btrim(p_submission)) else '{}'::jsonb end
  );

  return jsonb_build_object('task', to_jsonb(v_task), 'idempotent', false);
end;
$$;

-- Completing a linked challenge closes any still-open task in the same transaction.
create or replace function public.complete_team_challenge_tasks_after_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.team_tasks%rowtype;
  v_updated_task public.team_tasks%rowtype;
  v_previous_status text;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    for v_task in
      select task.*
      from public.team_tasks task
      where task.task_kind = 'challenge'
        and task.challenge_id = new.challenge_id
        and task.member_user_id = new.user_id
        and task.status in ('proposed', 'accepted', 'returned')
      for update
    loop
      v_previous_status := v_task.status;
      update public.team_tasks task
      set status = 'completed',
          accepted_at = coalesce(task.accepted_at, now()),
          completed_at = now(),
          version = task.version + 1,
          updated_at = now()
      where task.id = v_task.id
      returning task.* into v_updated_task;
      insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version)
      values (v_updated_task.id, new.user_id, 'challenge_completed', v_previous_status, v_updated_task.status, v_updated_task.version);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists complete_team_challenge_tasks on public.user_challenges;
create trigger complete_team_challenge_tasks
after update of status on public.user_challenges
for each row execute function public.complete_team_challenge_tasks_after_completion();

revoke all on function public.complete_team_challenge_tasks_after_completion() from public, anon, authenticated;

create or replace function public.cancel_team_tasks_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.team_tasks%rowtype;
  v_updated_task public.team_tasks%rowtype;
  v_previous_status text;
begin
  if old.leader_user_id is distinct from new.leader_user_id or old.is_active is distinct from new.is_active then
    for v_task in
      select task.*
      from public.team_tasks task
      where task.member_user_id = new.member_user_id
        and (not new.is_active or task.leader_user_id is distinct from new.leader_user_id)
        and task.status in ('proposed', 'accepted', 'submitted', 'returned')
      for update
    loop
      v_previous_status := v_task.status;
      update public.team_tasks task
      set status = 'cancelled',
          version = task.version + 1,
          updated_at = now()
      where task.id = v_task.id
      returning task.* into v_updated_task;
      insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
      values (
        v_updated_task.id,
        new.member_user_id,
        'cancelled',
        v_previous_status,
        v_updated_task.status,
        v_updated_task.version,
        jsonb_build_object('reason', case when not new.is_active then 'membership_inactive' else 'leader_changed' end)
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_team_tasks_after_membership_change on public.team_memberships;
create trigger cancel_team_tasks_after_membership_change
after update of leader_user_id, is_active on public.team_memberships
for each row execute function public.cancel_team_tasks_after_membership_change();

revoke all on function public.cancel_team_tasks_after_membership_change() from public, anon, authenticated;

revoke all on function public.create_team_task(uuid, uuid, text, text, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.transition_team_task(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.create_team_task(uuid, uuid, text, text, text, timestamptz, uuid) to service_role;
grant execute on function public.transition_team_task(uuid, uuid, text, integer, text) to service_role;

create or replace function public.count_activated_referrals(p_referrer_user_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.referral_edges edge
  where edge.referrer_user_id = p_referrer_user_id
    and (
      exists (
        select 1 from public.wishes wish
        where wish.owner_user_id = edge.referral_user_id
          and wish.deleted_at is null
          and wish.created_at >= edge.claimed_at
      )
      or exists (
        select 1 from public.user_core_growth_plans plan
        where plan.user_id = edge.referral_user_id
          and plan.created_at >= edge.claimed_at
      )
      or exists (
        select 1
        from public.challenge_completion_snapshots completion
        where completion.user_id = edge.referral_user_id
          and completion.completed_at >= edge.claimed_at
          and completion.challenge_category is not null
          and completion.challenge_category <> 'onboarding'
      )
    );
$$;

create or replace function public.count_retained_referrals(p_referrer_user_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.referral_edges edge
  where edge.referrer_user_id = p_referrer_user_id
    and exists (
      select 1
      from public.product_events opened
      where opened.user_id = edge.referral_user_id
        and opened.event_name = 'app_open'
        and opened.occurred_at >= edge.claimed_at + interval '7 days'
        and exists (
          select 1
          from public.product_events meaningful
          where meaningful.user_id = opened.user_id
            and meaningful.event_name in ('wish_created', 'growth_plan_saved', 'challenge_accepted', 'challenge_completed')
            and (meaningful.occurred_at at time zone 'utc')::date = (opened.occurred_at at time zone 'utc')::date
        )
    );
$$;

revoke all on function public.count_activated_referrals(uuid) from public, anon, authenticated;
revoke all on function public.count_retained_referrals(uuid) from public, anon, authenticated;
grant execute on function public.count_activated_referrals(uuid) to service_role;
grant execute on function public.count_retained_referrals(uuid) to service_role;

-- Existing earned skill levels remain monotonic; only future refreshes use quality metrics.
update public.skill_level_rules rule
set verification_logic = case
      when rule.level between 2 and 4 then 'activated_referral_count'
      when rule.level >= 5 then 'retained_referral_count'
      else rule.verification_logic
    end,
    requirements = case
      when rule.level between 2 and 4 then jsonb_build_object('ru', format('Активируй %s приглашённых участников.', rule.threshold), 'en', format('Activate %s referred participants.', rule.threshold))
      when rule.level >= 5 then jsonb_build_object('ru', format('Удержи %s приглашённых участников до D7.', rule.threshold), 'en', format('Retain %s referred participants through D7.', rule.threshold))
      else rule.requirements
    end,
    metadata = case
      when rule.level between 2 and 4 then jsonb_build_object('metric', 'activated_referrals')
      when rule.level >= 5 then jsonb_build_object('metric', 'retained_referrals_d7')
      else rule.metadata
    end
from public.skills skill
where rule.skill_id = skill.id
  and skill.slug = 'referral_acquisition'
  and rule.level >= 2;

create or replace function public.refresh_user_skill_levels(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  skill_row record;
  rule_row record;
  current_value bigint;
  calculated_level integer;
  checked_at timestamptz := now();
  snapshot jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;

  for skill_row in
    select skill.id
    from public.skills skill
    where skill.is_active
      and exists (select 1 from public.skill_level_rules rule where rule.skill_id = skill.id)
  loop
    calculated_level := 0;
    snapshot := jsonb_build_object('checked_at', checked_at, 'checks', '[]'::jsonb);

    for rule_row in
      select rule.level, rule.verification_logic, rule.threshold
      from public.skill_level_rules rule
      where rule.skill_id = skill_row.id
      order by rule.level
    loop
      current_value := case rule_row.verification_logic
        when 'referral_count' then (select count(*) from public.referral_edges edge where edge.referrer_user_id = p_user_id)
        when 'activated_referral_count' then public.count_activated_referrals(p_user_id)
        when 'retained_referral_count' then public.count_retained_referrals(p_user_id)
        when 'public_post_count' then (
          select count(*) from public.feed_posts post
          where post.author_user_id = p_user_id and post.status = 'published' and post.visibility = 'public' and post.deleted_at is null
        )
        when 'team_member_count' then (
          select count(*) from public.team_memberships membership
          where membership.leader_user_id = p_user_id and membership.is_active
        )
        when 'team_contact_count' then (
          select count(*) from public.user_contacts contact
          where contact.owner_user_id = p_user_id and contact.status = 'active' and contact.source in ('team_leader', 'team_member')
        )
        when 'challenge_completion_count' then (select count(*) from public.challenge_completion_snapshots completion where completion.user_id = p_user_id)
        else 0
      end;

      if current_value >= rule_row.threshold then
        calculated_level := greatest(calculated_level, rule_row.level);
      end if;

      snapshot := jsonb_set(
        snapshot,
        '{checks}',
        (snapshot->'checks') || jsonb_build_array(jsonb_build_object(
          'level', rule_row.level,
          'verification_logic', rule_row.verification_logic,
          'threshold', rule_row.threshold,
          'current_value', current_value,
          'passed', current_value >= rule_row.threshold
        ))
      );
    end loop;

    insert into public.user_skills (user_id, skill_id, earned_skill_level, status, last_checked_at, verification_snapshot, updated_at)
    values (p_user_id, skill_row.id, calculated_level, case when calculated_level > 0 then 'verified' else 'unverified' end, checked_at, snapshot, checked_at)
    on conflict (user_id, skill_id) do update
    set earned_skill_level = greatest(user_skills.earned_skill_level, excluded.earned_skill_level),
        status = case when greatest(user_skills.earned_skill_level, excluded.earned_skill_level) > 0 then 'verified' else 'unverified' end,
        last_checked_at = excluded.last_checked_at,
        verification_snapshot = excluded.verification_snapshot,
        updated_at = excluded.updated_at;
  end loop;

  return jsonb_build_object('user_id', p_user_id, 'checked_at', checked_at);
end;
$$;

revoke all on function public.refresh_user_skill_levels(uuid) from public, anon, authenticated;
grant execute on function public.refresh_user_skill_levels(uuid) to service_role;

insert into public.challenges (
  id, title, description, instructions, requirements, reward_label, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, reward_amount, reward_account
) values (
  'b5b8f0f1-2b44-4c46-9e7d-77dbb9bf7c01',
  '{"ru":"Помоги новичку выполнить шаг","en":"Help a newcomer complete one step"}'::jsonb,
  '{"ru":"Помоги участнику своей команды сделать один конкретный шаг.","en":"Help a member of your team complete one concrete step."}'::jsonb,
  '{"ru":"Назначь участнику ручное задание или челлендж, дождись результата и подтверди его в Teams.","en":"Assign a manual task or challenge, wait for the result, and confirm it in Teams."}'::jsonb,
  '{"ru":"Завершённое задание, назначенное участнику в первые семь дней после регистрации.","en":"A completed task assigned to a member during their first seven days after registration."}'::jsonb,
  '{"ru":"Подтверждённый шаг","en":"Verified help step"}'::jsonb,
  'social', 2, 7, 'auto', 'team_task_help_completed', 115, 'teams', 0, 'core'
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    reward_label = excluded.reward_label,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    duration_days = excluded.duration_days,
    verification_type = excluded.verification_type,
    verification_logic = excluded.verification_logic,
    sort_order = excluded.sort_order,
    action_view = excluded.action_view,
    reward_amount = excluded.reward_amount,
    reward_account = excluded.reward_account;
