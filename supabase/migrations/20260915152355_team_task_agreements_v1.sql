-- Team task agreements, review feedback, revision proposals and help requests.
-- This migration extends the existing Team Help Loop without changing its
-- status contract or reward rules.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'team_task_events_event_type_check') then
    alter table public.team_task_events drop constraint team_task_events_event_type_check;
  end if;
  alter table public.team_task_events add constraint team_task_events_event_type_check
    check (event_type in ('created', 'accepted', 'submitted', 'completed', 'returned', 'declined', 'cancelled', 'challenge_completed', 'feedback_given', 'help_requested', 'help_resolved', 'revision_proposed', 'revision_accepted', 'revision_declined'));
end;
$$;

alter table public.team_tasks
  add column if not exists goal_context text,
  add column if not exists expected_result text,
  add column if not exists first_step text,
  add column if not exists estimated_minutes integer,
  add column if not exists verification_criteria text,
  add column if not exists leader_review_due_at timestamptz,
  add column if not exists review_feedback text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_tasks_goal_context_length_check') then
    alter table public.team_tasks add constraint team_tasks_goal_context_length_check
      check (goal_context is null or char_length(goal_context) <= 1200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_tasks_expected_result_length_check') then
    alter table public.team_tasks add constraint team_tasks_expected_result_length_check
      check (expected_result is null or char_length(expected_result) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_tasks_first_step_length_check') then
    alter table public.team_tasks add constraint team_tasks_first_step_length_check
      check (first_step is null or char_length(first_step) <= 1200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_tasks_estimated_minutes_check') then
    alter table public.team_tasks add constraint team_tasks_estimated_minutes_check
      check (estimated_minutes is null or estimated_minutes between 1 and 1440);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_tasks_verification_criteria_length_check') then
    alter table public.team_tasks add constraint team_tasks_verification_criteria_length_check
      check (verification_criteria is null or char_length(verification_criteria) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_tasks_review_feedback_length_check') then
    alter table public.team_tasks add constraint team_tasks_review_feedback_length_check
      check (review_feedback is null or char_length(review_feedback) <= 4000);
  end if;
end;
$$;

create index if not exists team_tasks_review_due_idx
  on public.team_tasks (leader_user_id, leader_review_due_at nulls last, updated_at desc)
  where status in ('submitted', 'returned');

create table if not exists public.team_task_revisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  proposer_user_id uuid not null references auth.users(id) on delete cascade,
  base_version integer not null check (base_version > 0),
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'superseded')),
  response_user_id uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_task_revisions_one_open_idx
  on public.team_task_revisions (task_id)
  where status = 'open';
create index if not exists team_task_revisions_task_created_idx
  on public.team_task_revisions (task_id, created_at desc);

create table if not exists public.team_task_help_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('blocked', 'clarification', 'feedback', 'other')),
  comment text not null default '' check (char_length(comment) <= 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_task_help_one_open_idx
  on public.team_task_help_requests (task_id)
  where status = 'open';
create index if not exists team_task_help_task_created_idx
  on public.team_task_help_requests (task_id, created_at desc);

alter table public.team_task_revisions enable row level security;
alter table public.team_task_help_requests enable row level security;

revoke all on table public.team_task_revisions from public, anon, authenticated;
revoke all on table public.team_task_help_requests from public, anon, authenticated;
grant select on table public.team_task_revisions to authenticated;
grant select on table public.team_task_help_requests to authenticated;
grant select on table public.team_task_revisions to service_role;
grant select on table public.team_task_help_requests to service_role;
revoke insert, update, delete on table public.team_task_revisions from service_role;
revoke insert, update, delete on table public.team_task_help_requests from service_role;

drop policy if exists "Team participants can read task revisions" on public.team_task_revisions;
create policy "Team participants can read task revisions"
on public.team_task_revisions
for select
to authenticated
using (exists (
  select 1 from public.team_tasks task
  where task.id = team_task_revisions.task_id
    and (select auth.uid()) in (task.leader_user_id, task.member_user_id)
));

drop policy if exists "Team participants can read task help" on public.team_task_help_requests;
create policy "Team participants can read task help"
on public.team_task_help_requests
for select
to authenticated
using (exists (
  select 1 from public.team_tasks task
  where task.id = team_task_help_requests.task_id
    and (select auth.uid()) in (task.leader_user_id, task.member_user_id)
));

create or replace function public.touch_team_task_collaboration_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_team_task_revisions_updated_at on public.team_task_revisions;
create trigger touch_team_task_revisions_updated_at
before update on public.team_task_revisions
for each row execute function public.touch_team_task_collaboration_updated_at();
drop trigger if exists touch_team_task_help_updated_at on public.team_task_help_requests;
create trigger touch_team_task_help_updated_at
before update on public.team_task_help_requests
for each row execute function public.touch_team_task_collaboration_updated_at();
revoke all on function public.touch_team_task_collaboration_updated_at() from public, anon, authenticated;

create or replace function public.request_team_task_help(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_reason text,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.team_tasks%rowtype;
  v_help public.team_task_help_requests%rowtype;
begin
  if p_actor_user_id is null or p_task_id is null then
    raise exception 'A task and actor are required.' using errcode = '22023';
  end if;
  if p_reason not in ('blocked', 'clarification', 'feedback', 'other') then
    raise exception 'Unsupported help reason.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_comment, '')) > 2000 then
    raise exception 'Help comment is too long.' using errcode = '22023';
  end if;

  select * into v_task
  from public.team_tasks
  where id = p_task_id
  for update;
  if not found then
    raise exception 'Team task not found.' using errcode = 'P0002';
  end if;
  if p_actor_user_id not in (v_task.leader_user_id, v_task.member_user_id) then
    raise exception 'You are not a participant in this task.' using errcode = '42501';
  end if;
  if v_task.status not in ('proposed', 'accepted', 'submitted', 'returned') then
    raise exception 'Help is unavailable for a closed task.' using errcode = '22023';
  end if;

  select * into v_help
  from public.team_task_help_requests
  where task_id = p_task_id and status = 'open'
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('helpRequest', to_jsonb(v_help), 'idempotent', true);
  end if;

  insert into public.team_task_help_requests (task_id, requester_user_id, reason, comment)
  values (p_task_id, p_actor_user_id, p_reason, btrim(coalesce(p_comment, '')))
  returning * into v_help;

  update public.team_tasks
  set version = version + 1, updated_at = now()
  where id = p_task_id
  returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
  values (p_task_id, p_actor_user_id, 'help_requested', v_task.status, v_task.status, v_task.version,
    jsonb_build_object('help_request_id', v_help.id, 'reason', p_reason));

  return jsonb_build_object('helpRequest', to_jsonb(v_help), 'idempotent', false);
end;
$$;

create or replace function public.resolve_team_task_help(
  p_actor_user_id uuid,
  p_help_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_help public.team_task_help_requests%rowtype;
  v_task public.team_tasks%rowtype;
begin
  select help.* into v_help
  from public.team_task_help_requests help
  join public.team_tasks task on task.id = help.task_id
  where help.id = p_help_request_id
    and p_actor_user_id in (task.leader_user_id, task.member_user_id)
  for update of help;
  if not found then
    raise exception 'Help request not found.' using errcode = 'P0002';
  end if;
  if v_help.status = 'resolved' then
    return jsonb_build_object('helpRequest', to_jsonb(v_help), 'idempotent', true);
  end if;

  update public.team_task_help_requests
  set status = 'resolved', resolved_by_user_id = p_actor_user_id, resolved_at = now(), updated_at = now()
  where id = v_help.id
  returning * into v_help;

  update public.team_tasks
  set version = version + 1, updated_at = now()
  where id = v_help.task_id
  returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
  values (v_task.id, p_actor_user_id, 'help_resolved', v_task.status, v_task.status, v_task.version,
    jsonb_build_object('help_request_id', v_help.id));

  return jsonb_build_object('helpRequest', to_jsonb(v_help), 'idempotent', false);
end;
$$;

create or replace function public.propose_team_task_revision(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.team_tasks%rowtype;
  v_revision public.team_task_revisions%rowtype;
begin
  if p_actor_user_id is null or p_task_id is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'A task, actor and change object are required.' using errcode = '22023';
  end if;
  if p_changes = '{}'::jsonb then
    raise exception 'At least one change is required.' using errcode = '22023';
  end if;

  select * into v_task from public.team_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Team task not found.' using errcode = 'P0002';
  end if;
  if p_actor_user_id not in (v_task.leader_user_id, v_task.member_user_id) then
    raise exception 'You are not a participant in this task.' using errcode = '42501';
  end if;
  if v_task.status not in ('proposed', 'accepted', 'returned') then
    raise exception 'The task conditions can no longer be changed.' using errcode = '22023';
  end if;

  select * into v_revision
  from public.team_task_revisions
  where task_id = p_task_id and status = 'open'
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('revision', to_jsonb(v_revision), 'idempotent', true);
  end if;

  insert into public.team_task_revisions (task_id, proposer_user_id, base_version, changes)
  values (p_task_id, p_actor_user_id, v_task.version, p_changes)
  returning * into v_revision;

  update public.team_tasks set version = version + 1, updated_at = now()
  where id = p_task_id returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
  values (p_task_id, p_actor_user_id, 'revision_proposed', v_task.status, v_task.status, v_task.version,
    jsonb_build_object('revision_id', v_revision.id, 'base_version', v_revision.base_version));

  return jsonb_build_object('revision', to_jsonb(v_revision), 'idempotent', false);
end;
$$;

create or replace function public.respond_team_task_revision(
  p_actor_user_id uuid,
  p_revision_id uuid,
  p_action text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.team_task_revisions%rowtype;
  v_task public.team_tasks%rowtype;
  v_next_status text;
  v_event_type text;
begin
  if p_action not in ('accept', 'decline') then
    raise exception 'Invalid revision action.' using errcode = '22023';
  end if;
  select revision.* into v_revision
  from public.team_task_revisions revision
  join public.team_tasks task on task.id = revision.task_id
  where revision.id = p_revision_id
    and p_actor_user_id in (task.leader_user_id, task.member_user_id)
  for update of revision;
  if not found then
    raise exception 'Revision proposal not found.' using errcode = 'P0002';
  end if;
  select * into v_task from public.team_tasks where id = v_revision.task_id for update;
  if v_revision.status <> 'open' then
    return jsonb_build_object('revision', to_jsonb(v_revision), 'task', to_jsonb(v_task), 'idempotent', true);
  end if;
  if p_actor_user_id = v_revision.proposer_user_id then
    raise exception 'The other participant must respond to a revision.' using errcode = '42501';
  end if;
  if p_expected_version is not null and p_expected_version <> v_task.version then
    raise exception 'Team task changed. Refresh and try again.' using errcode = '40001';
  end if;
  if v_task.version <> v_revision.base_version + 1 then
    raise exception 'This revision is out of date.' using errcode = '40001';
  end if;

  v_next_status := case when p_action = 'accept' then 'accepted' else 'declined' end;
  v_event_type := case when p_action = 'accept' then 'revision_accepted' else 'revision_declined' end;

  update public.team_task_revisions
  set status = v_next_status, response_user_id = p_actor_user_id, responded_at = now(), updated_at = now()
  where id = v_revision.id
  returning * into v_revision;

  if p_action = 'accept' then
    update public.team_tasks
    set title = case when v_revision.changes ? 'title' then coalesce(nullif(btrim(v_revision.changes->>'title'), ''), title) else title end,
        description = case when v_revision.changes ? 'description' then coalesce(v_revision.changes->>'description', description) else description end,
        goal_context = case when v_revision.changes ? 'goalContext' then nullif(btrim(v_revision.changes->>'goalContext'), '') else goal_context end,
        expected_result = case when v_revision.changes ? 'expectedResult' then nullif(btrim(v_revision.changes->>'expectedResult'), '') else expected_result end,
        first_step = case when v_revision.changes ? 'firstStep' then nullif(btrim(v_revision.changes->>'firstStep'), '') else first_step end,
        estimated_minutes = case when v_revision.changes ? 'estimatedMinutes' then nullif(v_revision.changes->>'estimatedMinutes', '')::integer else estimated_minutes end,
        verification_criteria = case when v_revision.changes ? 'verificationCriteria' then nullif(btrim(v_revision.changes->>'verificationCriteria'), '') else verification_criteria end,
        due_at = case when v_revision.changes ? 'dueAt' then nullif(v_revision.changes->>'dueAt', '')::timestamptz else due_at end,
        leader_review_due_at = case when v_revision.changes ? 'leaderReviewDueAt' then nullif(v_revision.changes->>'leaderReviewDueAt', '')::timestamptz else leader_review_due_at end,
        version = version + 1,
        updated_at = now()
    where id = v_task.id
    returning * into v_task;
  else
    update public.team_tasks set version = version + 1, updated_at = now()
    where id = v_task.id returning * into v_task;
  end if;

  insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
  values (v_task.id, p_actor_user_id, v_event_type, v_task.status, v_task.status, v_task.version,
    jsonb_build_object('revision_id', v_revision.id));

  return jsonb_build_object('revision', to_jsonb(v_revision), 'task', to_jsonb(v_task), 'idempotent', false);
end;
$$;

revoke all on function public.request_team_task_help(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.resolve_team_task_help(uuid, uuid) from public, anon, authenticated;
revoke all on function public.propose_team_task_revision(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.respond_team_task_revision(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.request_team_task_help(uuid, uuid, text, text) to service_role;
grant execute on function public.resolve_team_task_help(uuid, uuid) to service_role;
grant execute on function public.propose_team_task_revision(uuid, uuid, jsonb) to service_role;
grant execute on function public.respond_team_task_revision(uuid, uuid, text, integer) to service_role;


create or replace function public.create_team_task(
  p_actor_user_id uuid,
  p_member_user_id uuid,
  p_task_kind text,
  p_title text,
  p_description text default '',
  p_goal_context text default null,
  p_expected_result text default null,
  p_first_step text default null,
  p_estimated_minutes integer default null,
  p_verification_criteria text default null,
  p_due_at timestamptz default null,
  p_leader_review_due_at timestamptz default null,
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
  if char_length(coalesce(p_description, '')) > 4000
    or char_length(coalesce(p_goal_context, '')) > 1200
    or char_length(coalesce(p_expected_result, '')) > 2000
    or char_length(coalesce(p_first_step, '')) > 1200
    or char_length(coalesce(p_verification_criteria, '')) > 2000 then
    raise exception 'Task agreement text is too long.' using errcode = '22023';
  end if;
  if p_estimated_minutes is not null and p_estimated_minutes not between 1 and 1440 then
    raise exception 'Estimated duration must be between 1 and 1440 minutes.' using errcode = '22023';
  end if;
  if p_task_kind = 'challenge' and p_challenge_id is null then
    raise exception 'A challenge task requires a challenge.' using errcode = '22023';
  end if;
  if p_task_kind = 'manual' and p_challenge_id is not null then
    raise exception 'A manual task cannot reference a challenge.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.team_memberships membership
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
    leader_user_id, member_user_id, challenge_id, task_kind, title, description,
    goal_context, expected_result, first_step, estimated_minutes, verification_criteria,
    due_at, leader_review_due_at, newcomer_eligible
  ) values (
    p_actor_user_id, p_member_user_id, p_challenge_id, p_task_kind, btrim(p_title),
    coalesce(p_description, ''), nullif(btrim(coalesce(p_goal_context, '')), ''),
    nullif(btrim(coalesce(p_expected_result, '')), ''), nullif(btrim(coalesce(p_first_step, '')), ''),
    p_estimated_minutes, nullif(btrim(coalesce(p_verification_criteria, '')), ''),
    p_due_at, p_leader_review_due_at,
    coalesce(v_member_created_at >= now() - interval '7 days', false)
  ) returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, to_status, task_version)
  values (v_task.id, p_actor_user_id, 'created', v_task.status, v_task.version);

  if p_task_kind = 'challenge' then
    insert into public.user_challenges (user_id, challenge_id, status, updated_at)
    values (p_member_user_id, p_challenge_id, 'accepted', now())
    on conflict (user_id, challenge_id) do update
      set status = 'accepted', updated_at = excluded.updated_at
      where public.user_challenges.status <> 'completed';

    select status into v_challenge_status
    from public.user_challenges
    where user_id = p_member_user_id and challenge_id = p_challenge_id;

    if v_challenge_status = 'completed' then
      update public.team_tasks
      set status = 'completed', accepted_at = coalesce(accepted_at, now()),
          completed_at = now(), version = version + 1, updated_at = now()
      where id = v_task.id
      returning * into v_task;

      insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version)
      values (v_task.id, p_member_user_id, 'challenge_completed', 'proposed', v_task.status, v_task.version);
    end if;
  end if;

  return to_jsonb(v_task);
end;
$$;

revoke all on function public.create_team_task(uuid, uuid, text, text, text, text, text, text, integer, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.create_team_task(uuid, uuid, text, text, text, text, text, text, integer, text, timestamptz, timestamptz, uuid) to service_role;


create or replace function public.transition_team_task(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_action text,
  p_expected_version integer default null,
  p_submission text default null,
  p_feedback text default null
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
  v_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
begin
  select * into v_task from public.team_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Team task not found.' using errcode = 'P0002';
  end if;

  v_is_leader := p_actor_user_id = v_task.leader_user_id;
  v_is_member := p_actor_user_id = v_task.member_user_id;
  if not v_is_leader and not v_is_member then
    raise exception 'You are not a participant in this task.' using errcode = '42501';
  end if;

  v_idempotent := (p_action = 'accept' and v_is_member and v_task.status = 'accepted')
    or (p_action = 'submit' and v_is_member and v_task.status = 'submitted')
    or (p_action = 'complete' and v_is_leader and v_task.status = 'completed')
    or (p_action = 'return' and v_is_leader and v_task.status = 'returned')
    or (p_action = 'decline' and v_is_member and v_task.status = 'declined')
    or (p_action = 'cancel' and v_is_leader and v_task.status = 'cancelled');
  if v_idempotent then
    return jsonb_build_object('task', to_jsonb(v_task), 'idempotent', true);
  end if;

  if p_expected_version is not null and p_expected_version <> v_task.version then
    raise exception 'Team task changed. Refresh and try again.' using errcode = '40001';
  end if;

  if p_action = 'accept' and v_is_member and v_task.status = 'proposed' then
    v_next_status := 'accepted'; v_event_type := 'accepted';
  elsif p_action = 'decline' and v_is_member and v_task.status = 'proposed' then
    v_next_status := 'declined'; v_event_type := 'declined';
  elsif p_action = 'submit' and v_is_member and v_task.status in ('accepted', 'returned') then
    if v_task.task_kind = 'challenge' then
      raise exception 'Challenge tasks complete from the linked challenge.' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_submission, ''))) = 0 or char_length(p_submission) > 4000 then
      raise exception 'A submission between 1 and 4000 characters is required.' using errcode = '22023';
    end if;
    v_next_status := 'submitted'; v_event_type := 'submitted';
  elsif p_action = 'complete' and v_is_leader and v_task.status = 'submitted' then
    v_next_status := 'completed'; v_event_type := 'completed';
  elsif p_action = 'return' and v_is_leader and v_task.status = 'submitted' then
    if v_feedback is null then
      raise exception 'A concrete review is required when returning work.' using errcode = '22023';
    end if;
    v_next_status := 'returned'; v_event_type := 'returned';
  elsif p_action = 'cancel' and v_is_leader and v_task.status in ('proposed', 'accepted', 'submitted', 'returned') then
    v_next_status := 'cancelled'; v_event_type := 'cancelled';
  else
    raise exception 'This task action is not available in its current state.' using errcode = '22023';
  end if;

  v_previous_status := v_task.status;
  update public.team_tasks
  set status = v_next_status,
      submission = case when p_action = 'submit' then btrim(p_submission) else submission end,
      review_feedback = case when p_action in ('complete', 'return') then v_feedback else review_feedback end,
      reviewed_at = case when p_action in ('complete', 'return') then now() else reviewed_at end,
      reviewer_user_id = case when p_action in ('complete', 'return') then p_actor_user_id else reviewer_user_id end,
      accepted_at = case when v_next_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
      submitted_at = case when v_next_status = 'submitted' then now() else submitted_at end,
      completed_at = case when v_next_status = 'completed' then now() else completed_at end,
      version = version + 1,
      updated_at = now()
  where id = v_task.id
  returning * into v_task;

  insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
  values (v_task.id, p_actor_user_id, v_event_type, v_previous_status, v_task.status, v_task.version,
    case when v_feedback is not null then jsonb_build_object('has_feedback', true) else '{}'::jsonb end);

  if v_feedback is not null then
    update public.team_tasks set version = version + 1, updated_at = now()
    where id = v_task.id returning * into v_task;
    insert into public.team_task_events (task_id, actor_user_id, event_type, from_status, to_status, task_version, metadata)
    values (v_task.id, p_actor_user_id, 'feedback_given', v_task.status, v_task.status, v_task.version, '{}'::jsonb);
  end if;

  return jsonb_build_object('task', to_jsonb(v_task), 'idempotent', false);
end;
$$;

revoke all on function public.transition_team_task(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.transition_team_task(uuid, uuid, text, integer, text, text) to service_role;
