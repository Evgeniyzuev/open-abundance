create extension if not exists pg_cron;

create table if not exists public.team_leadership (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bonus_points integer not null default 0 check (bonus_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_assignment_queue (
  member_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid references auth.users(id) on delete set null,
  reason text not null default 'no_available_leader',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referrer_user_id is null or referrer_user_id <> member_user_id)
);

create table if not exists public.team_membership_events (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  previous_leader_user_id uuid references auth.users(id) on delete set null,
  new_leader_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('assigned', 'reassigned', 'queued')),
  assignment_source text not null check (assignment_source in ('direct_referrer', 'referrer_tree', 'global_queue', 'system')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (previous_leader_user_id is null or previous_leader_user_id <> member_user_id),
  check (new_leader_user_id is null or new_leader_user_id <> member_user_id)
);

create index if not exists team_assignment_queue_created_at_idx
on public.team_assignment_queue (created_at);

create index if not exists team_membership_events_member_created_at_idx
on public.team_membership_events (member_user_id, created_at desc);

create index if not exists team_membership_events_new_leader_created_at_idx
on public.team_membership_events (new_leader_user_id, created_at desc);

alter table public.team_leadership enable row level security;
alter table public.team_assignment_queue enable row level security;
alter table public.team_membership_events enable row level security;

drop policy if exists "Users can read own leadership" on public.team_leadership;
create policy "Users can read own leadership"
on public.team_leadership
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own team queue" on public.team_assignment_queue;
create policy "Users can read own team queue"
on public.team_assignment_queue
for select
using (auth.uid() = member_user_id);

drop policy if exists "Users can read related team events" on public.team_membership_events;
create policy "Users can read related team events"
on public.team_membership_events
for select
using (
  auth.uid() = member_user_id
  or auth.uid() = previous_leader_user_id
  or auth.uid() = new_leader_user_id
);

create or replace function public.team_leadership_snapshot(p_user_id uuid)
returns table (
  base_points integer,
  bonus_points integer,
  total_points integer,
  used_points integer,
  free_points integer,
  overcommitted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with leadership_values as (
    select
      greatest(coalesce(profile.level, 0), 0) * 10 as base_points,
      greatest(coalesce(leadership.bonus_points, 0), 0) as bonus_points,
      coalesce((
        select sum(greatest(coalesce(member_profile.level, 0), 0))::integer
        from public.team_memberships membership
        join public.user_profiles member_profile
          on member_profile.user_id = membership.member_user_id
        where membership.leader_user_id = p_user_id
          and membership.is_active
      ), 0) as used_points
    from public.user_profiles profile
    left join public.team_leadership leadership
      on leadership.user_id = profile.user_id
    where profile.user_id = p_user_id
  )
  select
    snapshot_values.base_points,
    snapshot_values.bonus_points,
    snapshot_values.base_points + snapshot_values.bonus_points,
    snapshot_values.used_points,
    greatest(snapshot_values.base_points + snapshot_values.bonus_points - snapshot_values.used_points, 0),
    snapshot_values.used_points > snapshot_values.base_points + snapshot_values.bonus_points
  from leadership_values snapshot_values;
$$;

create or replace function public.team_leader_level_rank(
  p_member_level integer,
  p_leader_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_leader_level = p_member_level + 1 then 0
    when p_leader_level > p_member_level + 1 then 1000 + (p_leader_level - p_member_level - 1)
    else 2000 + (p_member_level + 1 - p_leader_level)
  end;
$$;

create or replace function public.team_assignment_would_create_cycle(
  p_leader_user_id uuid,
  p_member_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive ancestors(user_id) as (
    select membership.leader_user_id
    from public.team_memberships membership
    where membership.member_user_id = p_leader_user_id
      and membership.is_active
      and membership.leader_user_id is not null

    union

    select membership.leader_user_id
    from public.team_memberships membership
    join ancestors parent
      on membership.member_user_id = parent.user_id
    where membership.is_active
      and membership.leader_user_id is not null
  )
  select p_leader_user_id = p_member_user_id
    or exists (
      select 1
      from ancestors
      where user_id = p_member_user_id
    );
$$;

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

create or replace function public.find_team_leader(
  p_member_user_id uuid,
  p_referrer_user_id uuid default null,
  p_excluded_leader_user_id uuid default null,
  p_prefer_referrer boolean default true
)
returns table (
  leader_user_id uuid,
  assignment_source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  member_level integer;
begin
  select profile.level
  into member_level
  from public.user_profiles profile
  where profile.user_id = p_member_user_id;

  if member_level is null or member_level < 1 then
    return;
  end if;

  if p_prefer_referrer
    and p_referrer_user_id is not null
    and p_referrer_user_id is distinct from p_excluded_leader_user_id
    and public.can_be_team_leader(p_referrer_user_id, p_member_user_id)
  then
    leader_user_id := p_referrer_user_id;
    assignment_source := 'direct_referrer';
    return next;
    return;
  end if;

  if p_referrer_user_id is not null then
    return query
    with recursive referral_tree(user_id, depth) as (
      select membership.member_user_id, 1
      from public.team_memberships membership
      where membership.leader_user_id = p_referrer_user_id
        and membership.is_active

      union

      select membership.member_user_id, parent.depth + 1
      from public.team_memberships membership
      join referral_tree parent
        on membership.leader_user_id = parent.user_id
      where membership.is_active
        and parent.depth < 40
    )
    select candidate.user_id, 'referrer_tree'::text
    from referral_tree tree
    join public.user_profiles candidate
      on candidate.user_id = tree.user_id
    cross join lateral public.team_leadership_snapshot(candidate.user_id) snapshot
    where candidate.user_id <> p_member_user_id
      and candidate.user_id is distinct from p_excluded_leader_user_id
      and public.can_be_team_leader(candidate.user_id, p_member_user_id)
    order by
      public.team_leader_level_rank(member_level, candidate.level),
      tree.depth,
      snapshot.free_points desc,
      (
        select max(event.created_at)
        from public.team_membership_events event
        where event.new_leader_user_id = candidate.user_id
      ) asc nulls first,
      candidate.user_id
    limit 1;

    if found then
      return;
    end if;
  end if;

  return query
  select candidate.user_id, 'global_queue'::text
  from public.user_profiles candidate
  cross join lateral public.team_leadership_snapshot(candidate.user_id) snapshot
  where candidate.user_id <> p_member_user_id
    and candidate.user_id is distinct from p_excluded_leader_user_id
    and public.can_be_team_leader(candidate.user_id, p_member_user_id)
  order by
    public.team_leader_level_rank(member_level, candidate.level),
    snapshot.free_points desc,
    (
      select max(event.created_at)
      from public.team_membership_events event
      where event.new_leader_user_id = candidate.user_id
    ) asc nulls first,
    candidate.user_id
  limit 1;
end;
$$;

create or replace function public.assign_team_member(
  p_member_user_id uuid,
  p_referrer_user_id uuid default null,
  p_reason text default 'automatic_distribution',
  p_allow_transition boolean default false
)
returns table (
  assignment_status text,
  assigned_leader_user_id uuid,
  assignment_source text,
  queue_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership public.team_memberships%rowtype;
  member_level integer;
  current_leader_level integer;
  candidate_leader_level integer;
  candidate_leader_user_id uuid;
  candidate_source text;
  effective_referrer_user_id uuid;
  current_core_balance numeric(30, 12);
  queue_already_existed boolean;
begin
  perform pg_advisory_xact_lock(hashtext('open_abundance_team_assignment'));

  select profile.level
  into member_level
  from public.user_profiles profile
  where profile.user_id = p_member_user_id;

  if member_level is null or member_level < 1 then
    return query
    select 'queued'::text, null::uuid, 'system'::text, 'waiting_level_1'::text;
    return;
  end if;

  select *
  into current_membership
  from public.team_memberships membership
  where membership.member_user_id = p_member_user_id
    and membership.is_active
  for update;

  if current_membership.leader_user_id is not null and not p_allow_transition then
    return query
    select
      'already_assigned'::text,
      current_membership.leader_user_id,
      'system'::text,
      null::text;
    return;
  end if;

  select edge.referrer_user_id
  into effective_referrer_user_id
  from public.referral_edges edge
  where edge.referral_user_id = p_member_user_id;

  effective_referrer_user_id := coalesce(effective_referrer_user_id, p_referrer_user_id);

  select candidate.leader_user_id, candidate.assignment_source
  into candidate_leader_user_id, candidate_source
  from public.find_team_leader(
    p_member_user_id,
    effective_referrer_user_id,
    current_membership.leader_user_id,
    not p_allow_transition
  ) candidate
  limit 1;

  if current_membership.leader_user_id is not null and p_allow_transition then
    if candidate_leader_user_id is null then
      return query
      select
        'already_assigned'::text,
        current_membership.leader_user_id,
        'system'::text,
        null::text;
      return;
    end if;

    select profile.level
    into current_leader_level
    from public.user_profiles profile
    where profile.user_id = current_membership.leader_user_id;

    select profile.level
    into candidate_leader_level
    from public.user_profiles profile
    where profile.user_id = candidate_leader_user_id;

    if public.team_leader_level_rank(member_level, candidate_leader_level)
      >= public.team_leader_level_rank(member_level, current_leader_level)
    then
      return query
      select
        'already_assigned'::text,
        current_membership.leader_user_id,
        'system'::text,
        null::text;
      return;
    end if;
  end if;

  if candidate_leader_user_id is null then
    select exists (
      select 1
      from public.team_assignment_queue queue
      where queue.member_user_id = p_member_user_id
    )
    into queue_already_existed;

    select account.balance::numeric(30, 12)
    into current_core_balance
    from public.core_accounts account
    where account.user_id = p_member_user_id;

    insert into public.team_memberships (
      member_user_id,
      leader_user_id,
      assigned_at,
      is_active,
      team_bonus_base_balance,
      team_bonus_base_at
    )
    values (
      p_member_user_id,
      null,
      now(),
      true,
      coalesce(current_core_balance, 0),
      now()
    )
    on conflict (member_user_id) do nothing;

    insert into public.team_assignment_queue (
      member_user_id,
      referrer_user_id,
      reason,
      attempt_count,
      last_attempt_at,
      updated_at
    )
    values (
      p_member_user_id,
      effective_referrer_user_id,
      'no_available_leader',
      1,
      now(),
      now()
    )
    on conflict (member_user_id) do update
    set referrer_user_id = coalesce(excluded.referrer_user_id, public.team_assignment_queue.referrer_user_id),
        reason = excluded.reason,
        attempt_count = public.team_assignment_queue.attempt_count + 1,
        last_attempt_at = now(),
        updated_at = now();

    if not queue_already_existed then
      insert into public.team_membership_events (
        member_user_id,
        previous_leader_user_id,
        new_leader_user_id,
        event_type,
        assignment_source,
        reason
      )
      values (
        p_member_user_id,
        current_membership.leader_user_id,
        null,
        'queued',
        'system',
        'no_available_leader'
      );
    end if;

    return query
    select 'queued'::text, null::uuid, 'system'::text, 'no_available_leader'::text;
    return;
  end if;

  if current_membership.leader_user_id is not null then
    perform public.settle_team_bonus_for_member(
      p_member_user_id,
      ((now() at time zone 'utc')::date),
      'leader_change',
      null
    );
  end if;

  select account.balance::numeric(30, 12)
  into current_core_balance
  from public.core_accounts account
  where account.user_id = p_member_user_id;

  insert into public.team_memberships (
    member_user_id,
    leader_user_id,
    assigned_at,
    is_active,
    team_bonus_base_balance,
    team_bonus_base_at
  )
  values (
    p_member_user_id,
    candidate_leader_user_id,
    now(),
    true,
    coalesce(current_core_balance, 0),
    now()
  )
  on conflict (member_user_id) do update
  set leader_user_id = excluded.leader_user_id,
      assigned_at = excluded.assigned_at,
      is_active = true,
      team_bonus_base_balance = excluded.team_bonus_base_balance,
      team_bonus_base_at = excluded.team_bonus_base_at;

  delete from public.team_assignment_queue queue
  where queue.member_user_id = p_member_user_id;

  insert into public.team_membership_events (
    member_user_id,
    previous_leader_user_id,
    new_leader_user_id,
    event_type,
    assignment_source,
    reason
  )
  values (
    p_member_user_id,
    current_membership.leader_user_id,
    candidate_leader_user_id,
    case when current_membership.leader_user_id is null then 'assigned' else 'reassigned' end,
    candidate_source,
    p_reason
  );

  return query
  select
    case candidate_source
      when 'direct_referrer' then 'assigned_to_referrer'
      when 'referrer_tree' then 'assigned_in_referrer_tree'
      else 'assigned_from_queue'
    end,
    candidate_leader_user_id,
    candidate_source,
    null::text;
end;
$$;

create or replace function public.claim_referral_and_assign_team(
  p_member_user_id uuid,
  p_referral_code text default null,
  p_guest_id uuid default null,
  p_captured_at timestamptz default null
)
returns table (
  assignment_status text,
  assigned_leader_user_id uuid,
  assignment_source text,
  queue_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_user_id uuid;
  normalized_referral_code text;
begin
  normalized_referral_code := nullif(btrim(p_referral_code), '');

  select edge.referrer_user_id
  into referrer_user_id
  from public.referral_edges edge
  where edge.referral_user_id = p_member_user_id;

  if referrer_user_id is null and normalized_referral_code is not null then
    select code.user_id
    into referrer_user_id
    from public.referral_codes code
    where code.code = normalized_referral_code
      and code.is_active
      and code.user_id <> p_member_user_id;

    if referrer_user_id is not null then
      insert into public.referral_edges (
        referral_user_id,
        referrer_user_id,
        referral_code,
        guest_id,
        captured_at,
        source
      )
      values (
        p_member_user_id,
        referrer_user_id,
        normalized_referral_code,
        p_guest_id,
        p_captured_at,
        'referral_link'
      )
      on conflict (referral_user_id) do nothing;

      select edge.referrer_user_id
      into referrer_user_id
      from public.referral_edges edge
      where edge.referral_user_id = p_member_user_id;
    end if;
  end if;

  return query
  select *
  from public.assign_team_member(
    p_member_user_id,
    referrer_user_id,
    'referral_claim',
    false
  );
end;
$$;

create or replace function public.preview_team_distribution(p_limit integer default 100)
returns table (
  member_user_id uuid,
  member_level integer,
  referrer_user_id uuid,
  proposed_leader_user_id uuid,
  assignment_source text,
  reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.user_id,
    profile.level,
    edge.referrer_user_id,
    candidate.leader_user_id,
    candidate.assignment_source,
    case when candidate.leader_user_id is null then 'no_available_leader' else 'ready' end
  from public.user_profiles profile
  left join public.team_memberships membership
    on membership.member_user_id = profile.user_id
    and membership.is_active
  left join public.referral_edges edge
    on edge.referral_user_id = profile.user_id
  left join lateral public.find_team_leader(
    profile.user_id,
    edge.referrer_user_id,
    null,
    true
  ) candidate on true
  where profile.level >= 1
    and membership.leader_user_id is null
  order by profile.created_at, profile.user_id
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

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
      updated_at = now();

  for queue_record in
    select queue.member_user_id, queue.referrer_user_id
    from public.team_assignment_queue queue
    join public.user_profiles profile
      on profile.user_id = queue.member_user_id
    where profile.level >= 1
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
end;
$$;

revoke all on function public.team_leadership_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.team_assignment_would_create_cycle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_be_team_leader(uuid, uuid) from public, anon, authenticated;
revoke all on function public.find_team_leader(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.assign_team_member(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_referral_and_assign_team(uuid, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.preview_team_distribution(integer) from public, anon, authenticated;
revoke all on function public.reconcile_team_distribution(integer) from public, anon, authenticated;
revoke all on function public.revalidate_team_membership_for_level_change(uuid, integer) from public, anon, authenticated;

grant execute on function public.team_leadership_snapshot(uuid) to service_role;
grant execute on function public.claim_referral_and_assign_team(uuid, text, uuid, timestamptz) to service_role;
grant execute on function public.preview_team_distribution(integer) to service_role;
grant execute on function public.reconcile_team_distribution(integer) to service_role;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'open-abundance-team-reconciliation'
  ) then
    perform cron.unschedule('open-abundance-team-reconciliation');
  end if;
end;
$$;

select cron.schedule(
  'open-abundance-team-reconciliation',
  '*/5 * * * *',
  $$select public.reconcile_team_distribution(100);$$
);
