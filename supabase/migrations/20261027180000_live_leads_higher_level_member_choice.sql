-- Live leads (Evgen, 2026-10-27, docs/SMALL_WISHES_AND_LEADS_PLAN.md stage 4):
-- 1. A lead is always strictly higher in level than each follower. Before, the global search could fall back
--    to an equal or lower lead, and level growth kept the old lead when no better one was free.
-- 2. Where no live lead is higher, the follower stays with the Open Abundance lead (leader_user_id null),
--    and the queue keeps looking for a live one.
-- 3. A follower may choose another lead from the available ones at most once a day.

alter table public.team_membership_events
  drop constraint if exists team_membership_events_assignment_source_check;
alter table public.team_membership_events
  add constraint team_membership_events_assignment_source_check
  check (assignment_source in ('direct_referrer', 'referrer_tree', 'global_queue', 'system', 'member_choice'));

create or replace function public.can_be_team_leader(
  p_leader_user_id uuid,
  p_member_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      leader.level >= 2
      and leader.level > greatest(member.level, 0)
      and not public.team_assignment_would_create_cycle(p_leader_user_id, p_member_user_id)
      and snapshot.used_points + greatest(member.level, 0) <= snapshot.total_points
    from public.user_profiles leader
    join public.user_profiles member
      on member.user_id = p_member_user_id
    cross join lateral public.team_leadership_snapshot(p_leader_user_id) snapshot
    where leader.user_id = p_leader_user_id
      and leader.user_id <> member.user_id
  ), false);
$$;

-- Moves a follower whose lead is not higher any more to the Open Abundance lead and queues a live search.
create or replace function public.detach_team_member_to_system(
  p_member_user_id uuid,
  p_reason text default 'leader_not_higher'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_membership public.team_memberships%rowtype;
  member_referrer uuid;
begin
  select *
  into active_membership
  from public.team_memberships membership
  where membership.member_user_id = p_member_user_id
    and membership.is_active
  for update;

  if active_membership.member_user_id is null or active_membership.leader_user_id is null then
    return;
  end if;

  perform public.settle_team_bonus_for_member(
    p_member_user_id,
    ((now() at time zone 'utc')::date),
    'leader_change',
    null
  );

  update public.team_memberships
  set leader_user_id = null,
      assigned_at = now(),
      team_bonus_base_balance = coalesce((
        select account.balance::numeric(30, 12)
        from public.core_accounts account
        where account.user_id = p_member_user_id
      ), 0),
      team_bonus_base_at = now()
  where member_user_id = p_member_user_id
    and is_active;

  select edge.referrer_user_id
  into member_referrer
  from public.referral_edges edge
  where edge.referral_user_id = p_member_user_id;

  insert into public.team_assignment_queue (member_user_id, referrer_user_id, reason)
  values (p_member_user_id, member_referrer, p_reason)
  on conflict (member_user_id) do update
  set reason = excluded.reason,
      updated_at = now();

  insert into public.team_membership_events (
    member_user_id, previous_leader_user_id, new_leader_user_id, event_type, assignment_source, reason
  )
  values (
    p_member_user_id, active_membership.leader_user_id, null, 'queued', 'system', p_reason
  );
end;
$$;

-- Same as before, plus: when the follower caught up with the lead and no higher lead is free,
-- the follower goes to the Open Abundance lead instead of staying with an equal one.
create or replace function public.revalidate_team_membership_for_level_change(
  p_member_user_id uuid,
  p_member_level integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_membership public.team_memberships%rowtype;
  member_level integer;
  leader_level integer;
  referrer_user_id uuid;
begin
  member_level := p_member_level;

  if member_level is null then
    select profile.level
    into member_level
    from public.user_profiles profile
    where profile.user_id = p_member_user_id;
  end if;

  if member_level is null or member_level < 1 then
    return;
  end if;

  select *
  into active_membership
  from public.team_memberships membership
  where membership.member_user_id = p_member_user_id
    and membership.is_active;

  if active_membership.leader_user_id is null then
    select edge.referrer_user_id
    into referrer_user_id
    from public.referral_edges edge
    where edge.referral_user_id = p_member_user_id;

    insert into public.team_assignment_queue (
      member_user_id,
      referrer_user_id,
      reason
    )
    values (
      p_member_user_id,
      referrer_user_id,
      'level_ready'
    )
    on conflict (member_user_id) do update
    set referrer_user_id = coalesce(excluded.referrer_user_id, public.team_assignment_queue.referrer_user_id),
        reason = excluded.reason,
        updated_at = now();
    return;
  end if;

  select profile.level
  into leader_level
  from public.user_profiles profile
  where profile.user_id = active_membership.leader_user_id;

  if leader_level is null or member_level < leader_level then
    return;
  end if;

  perform *
  from public.assign_team_member(
    p_member_user_id,
    null,
    'level_growth',
    true
  );

  -- No higher live lead was free: the Open Abundance lead takes over until one is.
  select profile.level
  into leader_level
  from public.team_memberships membership
  join public.user_profiles profile
    on profile.user_id = membership.leader_user_id
  where membership.member_user_id = p_member_user_id
    and membership.is_active;

  if leader_level is not null and leader_level <= member_level then
    perform public.detach_team_member_to_system(p_member_user_id, 'leader_not_higher');
  end if;
end;
$$;

-- Leads the signed-in follower can choose now: strictly higher, with free leadership points, no cycles.
create or replace function public.list_my_team_leader_options(p_limit integer default 20)
returns table (
  leader_user_id uuid,
  level integer,
  free_points integer,
  is_current boolean,
  is_referrer boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select profile.user_id, profile.level
    from public.user_profiles profile
    where profile.user_id = auth.uid()
  ),
  current_lead as (
    select membership.leader_user_id
    from public.team_memberships membership
    where membership.member_user_id = auth.uid()
      and membership.is_active
  ),
  my_referrer as (
    select edge.referrer_user_id
    from public.referral_edges edge
    where edge.referral_user_id = auth.uid()
  )
  select
    candidate.user_id,
    candidate.level,
    snapshot.free_points,
    candidate.user_id = (select leader_user_id from current_lead),
    candidate.user_id = (select referrer_user_id from my_referrer)
  from public.user_profiles candidate
  cross join me
  cross join lateral public.team_leadership_snapshot(candidate.user_id) snapshot
  where candidate.user_id <> me.user_id
    and candidate.deleted_at is null
    and candidate.level > greatest(me.level, 0)
    and (
      candidate.user_id = (select leader_user_id from current_lead)
      or public.can_be_team_leader(candidate.user_id, me.user_id)
    )
  order by
    (candidate.user_id = (select leader_user_id from current_lead)) desc,
    (candidate.user_id = (select referrer_user_id from my_referrer)) desc,
    public.team_leader_level_rank(me.level, candidate.level),
    snapshot.free_points desc,
    candidate.user_id
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- When the signed-in follower may choose again (null = now).
create or replace function public.my_team_leader_next_choice_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(event.created_at) + interval '1 day'
  from public.team_membership_events event
  where event.member_user_id = auth.uid()
    and event.assignment_source = 'member_choice'
    and event.created_at > now() - interval '1 day';
$$;

-- The signed-in follower picks a lead from the available ones, at most once a day.
create or replace function public.choose_my_team_leader(p_leader_user_id uuid)
returns table (
  status text,
  next_choice_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid := auth.uid();
  member_level integer;
  current_membership public.team_memberships%rowtype;
  next_at timestamptz;
begin
  if member_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext('open_abundance_team_assignment'));

  select max(event.created_at) + interval '1 day'
  into next_at
  from public.team_membership_events event
  where event.member_user_id = member_id
    and event.assignment_source = 'member_choice'
    and event.created_at > now() - interval '1 day';

  if next_at is not null then
    return query select 'too_soon'::text, next_at;
    return;
  end if;

  select profile.level into member_level
  from public.user_profiles profile
  where profile.user_id = member_id;

  if member_level is null or member_level < 1 then
    return query select 'level_too_low'::text, null::timestamptz;
    return;
  end if;

  select * into current_membership
  from public.team_memberships membership
  where membership.member_user_id = member_id
    and membership.is_active
  for update;

  if current_membership.leader_user_id is not distinct from p_leader_user_id then
    return query select 'already_current'::text, null::timestamptz;
    return;
  end if;

  if p_leader_user_id is null or not public.can_be_team_leader(p_leader_user_id, member_id) then
    return query select 'not_available'::text, null::timestamptz;
    return;
  end if;

  if current_membership.leader_user_id is not null then
    perform public.settle_team_bonus_for_member(
      member_id,
      ((now() at time zone 'utc')::date),
      'leader_change',
      null
    );
  end if;

  insert into public.team_memberships (
    member_user_id, leader_user_id, assigned_at, is_active, team_bonus_base_balance, team_bonus_base_at
  )
  values (
    member_id,
    p_leader_user_id,
    now(),
    true,
    coalesce((select account.balance::numeric(30, 12) from public.core_accounts account where account.user_id = member_id), 0),
    now()
  )
  on conflict (member_user_id) do update
  set leader_user_id = excluded.leader_user_id,
      assigned_at = excluded.assigned_at,
      is_active = true,
      team_bonus_base_balance = excluded.team_bonus_base_balance,
      team_bonus_base_at = excluded.team_bonus_base_at;

  delete from public.team_assignment_queue queue
  where queue.member_user_id = member_id;

  insert into public.team_membership_events (
    member_user_id, previous_leader_user_id, new_leader_user_id, event_type, assignment_source, reason
  )
  values (
    member_id,
    current_membership.leader_user_id,
    p_leader_user_id,
    case when current_membership.leader_user_id is null then 'assigned' else 'reassigned' end,
    'member_choice',
    'member_choice'
  );

  return query select 'changed'::text, now() + interval '1 day';
end;
$$;

revoke all on function public.detach_team_member_to_system(uuid, text) from public, anon, authenticated;
revoke all on function public.revalidate_team_membership_for_level_change(uuid, integer) from public, anon, authenticated;
revoke all on function public.list_my_team_leader_options(integer) from public, anon;
revoke all on function public.my_team_leader_next_choice_at() from public, anon;
revoke all on function public.choose_my_team_leader(uuid) from public, anon;
grant execute on function public.list_my_team_leader_options(integer) to authenticated;
grant execute on function public.my_team_leader_next_choice_at() to authenticated;
grant execute on function public.choose_my_team_leader(uuid) to authenticated;

-- Existing followers whose lead is not higher go to the Open Abundance lead; the queue then looks for a live one.
do $$
declare
  stale record;
begin
  for stale in
    select membership.member_user_id
    from public.team_memberships membership
    join public.user_profiles member on member.user_id = membership.member_user_id
    join public.user_profiles leader on leader.user_id = membership.leader_user_id
    where membership.is_active
      and leader.level <= member.level
  loop
    perform public.detach_team_member_to_system(stale.member_user_id, 'leader_not_higher');
  end loop;
end;
$$;

select * from public.reconcile_team_distribution(200);
