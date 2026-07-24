create or replace function public.process_team_assignment_queue(p_limit integer default 100)
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
    order by
      (queue.referrer_user_id is null),
      profile.level,
      queue.created_at,
      queue.member_user_id
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
    for update of queue skip locked
  loop
    select *
    into result_record
    from public.assign_team_member(
      queue_record.member_user_id,
      queue_record.referrer_user_id,
      'queue_processing',
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
begin
  insert into public.team_assignment_queue (
    member_user_id,
    referrer_user_id,
    reason
  )
  select
    profile.user_id,
    edge.referrer_user_id,
    'daily_reconciliation'
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

  return query
  select *
  from public.process_team_assignment_queue(p_limit);
end;
$$;

revoke all on function public.process_team_assignment_queue(integer) from public, anon, authenticated;
revoke all on function public.reconcile_team_distribution(integer) from public, anon, authenticated;
grant execute on function public.process_team_assignment_queue(integer) to service_role;
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

  if exists (
    select 1
    from cron.job
    where jobname = 'open-abundance-team-queue-processing'
  ) then
    perform cron.unschedule('open-abundance-team-queue-processing');
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'open-abundance-team-daily-reconciliation'
  ) then
    perform cron.unschedule('open-abundance-team-daily-reconciliation');
  end if;
end;
$$;

select cron.schedule(
  'open-abundance-team-queue-processing',
  '5 * * * *',
  $$select public.process_team_assignment_queue(100);$$
);

select cron.schedule(
  'open-abundance-team-daily-reconciliation',
  '15 3 * * *',
  $$select public.reconcile_team_distribution(100);$$
);
