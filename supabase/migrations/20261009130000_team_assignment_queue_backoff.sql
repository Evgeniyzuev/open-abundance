-- Team assignment queue: stop retrying hopeless assignments every cron run.
--
-- Before: reconcile_team_distribution() re-tried every queued member on every run, and each
-- try scans all potential leaders. A member who cannot be placed (for example a top-level
-- account whose only candidates would create a cycle) was retried thousands of times.
--
-- Now: every failed attempt pushes next_attempt_at out with exponential backoff (5 minutes
-- up to 24 hours), and the queue is "kicked" (retried on the next run) whenever something
-- that can create leadership capacity changes: a team membership is added, moved or removed,
-- or a user level changes. People therefore still get a leader soon after suitable capacity
-- appears, without constant polling.

alter table public.team_assignment_queue
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists team_assignment_queue_next_attempt_idx
  on public.team_assignment_queue (next_attempt_at);

create or replace function public.team_assignment_queue_apply_backoff()
returns trigger
language plpgsql
as $$
begin
  new.next_attempt_at := now() + (interval '5 minutes' * power(2, least(new.attempt_count, 8))::integer);
  if new.next_attempt_at > now() + interval '24 hours' then
    new.next_attempt_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists team_assignment_queue_apply_backoff on public.team_assignment_queue;
create trigger team_assignment_queue_apply_backoff
before update on public.team_assignment_queue
for each row
when (new.attempt_count > old.attempt_count)
execute function public.team_assignment_queue_apply_backoff();

create or replace function public.kick_team_assignment_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_assignment_queue
  set next_attempt_at = now()
  where next_attempt_at > now();
  return null;
end;
$$;

revoke all on function public.kick_team_assignment_queue() from public, anon, authenticated;

drop trigger if exists kick_team_queue_on_membership_change on public.team_memberships;
create trigger kick_team_queue_on_membership_change
after insert or update or delete on public.team_memberships
for each statement
execute function public.kick_team_assignment_queue();

drop trigger if exists kick_team_queue_on_level_change on public.user_profiles;
create trigger kick_team_queue_on_level_change
after update of level on public.user_profiles
for each row
when (old.level is distinct from new.level)
execute function public.kick_team_assignment_queue();

create or replace function public.reconcile_team_distribution(p_limit integer default 100)
returns table (
  processed_count integer,
  assigned_count integer,
  queued_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_record record;
  result_record record;
  processed_total integer := 0;
  assigned_total integer := 0;
  queued_total integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('open_abundance_team_assignment'));

  -- Enqueue members who have no active team yet. Existing rows are only touched when the
  -- referrer becomes known, so an unplaceable member does not cause a write on every run.
  insert into public.team_assignment_queue (
    member_user_id,
    referrer_user_id,
    reason
  )
  select
    profile.user_id,
    edge.referrer_user_id,
    'reconciliation'
  from public.user_profiles profile
  left join public.team_memberships membership
    on membership.member_user_id = profile.user_id
    and membership.is_active
  left join public.referral_edges edge
    on edge.referral_user_id = profile.user_id
  where profile.level >= 1
    and membership.leader_user_id is null
  on conflict (member_user_id) do update
  set referrer_user_id = coalesce(excluded.referrer_user_id, public.team_assignment_queue.referrer_user_id),
      next_attempt_at = now(),
      updated_at = now()
  where public.team_assignment_queue.referrer_user_id is null
    and excluded.referrer_user_id is not null;

  for queue_record in
    select queue.member_user_id, queue.referrer_user_id
    from public.team_assignment_queue queue
    join public.user_profiles profile
      on profile.user_id = queue.member_user_id
    where profile.level >= 1
      and queue.next_attempt_at <= now()
      and (
        queue.referrer_user_id is not null
        or profile.created_at <= now() - interval '2 minutes'
      )
    order by queue.created_at, queue.member_user_id
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
    for update of queue skip locked
  loop
    select *
    into result_record
    from public.assign_team_member(
      queue_record.member_user_id,
      queue_record.referrer_user_id,
      'reconciliation',
      false
    );

    processed_total := processed_total + 1;
    if result_record.assignment_status = 'queued' then
      queued_total := queued_total + 1;
    else
      assigned_total := assigned_total + 1;
    end if;
  end loop;

  return query
  select processed_total, assigned_total, queued_total;
end;
$$;
