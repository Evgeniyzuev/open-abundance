-- Coordinator learning loop (docs/AI_CONSTITUTION.md section 7).
-- The existing recommendation queue already records proposal -> decision. This adds what learning needs:
-- which strategy produced a proposal, and a measured outcome for its target people over a window after the
-- decision (wishes completed, challenges completed, "did it bring you closer" answers, Core growth).
-- A daily job measures approved/done recommendations; a report groups outcomes by kind and strategy.
-- Read-only over existing facts; nothing here changes balances or acts on people.

alter table public.coordinator_recommendations
  add column if not exists strategy_key text not null default 'unspecified'
    check (strategy_key ~ '^[a-z0-9][a-z0-9:._-]{0,79}$'),
  add column if not exists outcome_metrics jsonb,
  add column if not exists outcome_measured_at timestamptz;

update public.coordinator_recommendations
  set strategy_key = source || ':legacy'
  where strategy_key = 'unspecified';

create index if not exists coordinator_recommendations_measure_idx
  on public.coordinator_recommendations (status, decided_at)
  where status in ('approved', 'done');

-- Outcome of one recommendation for its target people in [decided_at, decided_at + window).
create or replace function public.coordinator_recommendation_outcome(p_id uuid, p_window_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rec as (
    select r.target_user_ids as targets, r.decided_at as starts,
           least(now(), r.decided_at + make_interval(days => p_window_days)) as ends
    from public.coordinator_recommendations r
    where r.id = p_id and r.decided_at is not null
  )
  select jsonb_build_object(
    'windowDays', p_window_days,
    'targets', cardinality(rec.targets),
    'measuredThrough', rec.ends,
    'wishesCompleted', (select count(*) from public.wishes w
      where w.owner_user_id = any(rec.targets) and w.status = 'completed' and w.deleted_at is null
        and w.completed_at >= rec.starts and w.completed_at < rec.ends),
    'challengesCompleted', (select count(*) from public.challenge_completion_snapshots c
      where c.user_id = any(rec.targets) and c.completed_at >= rec.starts and c.completed_at < rec.ends),
    'helped', (select count(*) from public.product_events e
      where e.user_id = any(rec.targets) and e.event_name = 'wish_outcome_answered'
        and e.properties ->> 'answer' = 'helped' and e.occurred_at >= rec.starts and e.occurred_at < rec.ends),
    'notHelped', (select count(*) from public.product_events e
      where e.user_id = any(rec.targets) and e.event_name = 'wish_outcome_answered'
        and e.properties ->> 'answer' in ('not_yet', 'not_relevant') and e.occurred_at >= rec.starts and e.occurred_at < rec.ends),
    'coreGrowth', coalesce((select sum(a.core_amount) from public.daily_core_accruals a
      where a.user_id = any(rec.targets) and a.accrual_date >= rec.starts::date and a.accrual_date < rec.ends::date), 0)
      + coalesce((select sum(u.core_reward_amount) from public.user_challenges u
      where u.user_id = any(rec.targets) and u.reward_settled_at >= rec.starts and u.reward_settled_at < rec.ends), 0)
  )
  from rec;
$$;

-- Daily: measure approved/done recommendations decided in the last 90 days (re-measured until the window closes).
create or replace function public.measure_coordinator_outcomes(p_window_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rec record;
begin
  for v_rec in
    select id from public.coordinator_recommendations
    where status in ('approved', 'done')
      and decided_at is not null
      and decided_at > now() - interval '90 days'
      and cardinality(target_user_ids) > 0
      and (outcome_measured_at is null or outcome_measured_at < decided_at + make_interval(days => p_window_days))
    limit 500
  loop
    update public.coordinator_recommendations
      set outcome_metrics = public.coordinator_recommendation_outcome(v_rec.id, p_window_days),
          outcome_measured_at = now()
      where id = v_rec.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- What works: outcomes per kind and strategy, averaged per target person.
create or replace function public.coordinator_strategy_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with grouped as (
    select
      kind,
      strategy_key,
      count(*) as proposed,
      count(*) filter (where status in ('approved', 'done')) as approved,
      count(*) filter (where status = 'rejected') as rejected,
      count(*) filter (where outcome_metrics is not null) as measured,
      sum((outcome_metrics ->> 'targets')::numeric) filter (where outcome_metrics is not null) as targets,
      sum((outcome_metrics ->> 'wishesCompleted')::numeric) filter (where outcome_metrics is not null) as wishes,
      sum((outcome_metrics ->> 'challengesCompleted')::numeric) filter (where outcome_metrics is not null) as challenges,
      sum((outcome_metrics ->> 'helped')::numeric) filter (where outcome_metrics is not null) as helped,
      sum((outcome_metrics ->> 'notHelped')::numeric) filter (where outcome_metrics is not null) as not_helped,
      sum((outcome_metrics ->> 'coreGrowth')::numeric) filter (where outcome_metrics is not null) as core_growth
    from public.coordinator_recommendations
    group by kind, strategy_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind,
    'strategy', strategy_key,
    'proposed', proposed,
    'approvalRate', case when proposed = 0 then null else round(approved::numeric / proposed, 3) end,
    'rejected', rejected,
    'measured', measured,
    'wishesPerTarget', case when coalesce(targets, 0) = 0 then null else round(wishes / targets, 3) end,
    'challengesPerTarget', case when coalesce(targets, 0) = 0 then null else round(challenges / targets, 3) end,
    'helpedShare', case when coalesce(helped, 0) + coalesce(not_helped, 0) = 0 then null else round(helped / (helped + not_helped), 3) end,
    'coreGrowthPerTarget', case when coalesce(targets, 0) = 0 then null else round(core_growth / targets, 6) end
  ) order by kind, strategy_key), '[]'::jsonb)
  from grouped;
$$;

revoke all on function public.coordinator_recommendation_outcome(uuid, integer) from public, anon, authenticated;
revoke all on function public.measure_coordinator_outcomes(integer) from public, anon, authenticated;
revoke all on function public.coordinator_strategy_report() from public, anon, authenticated;
grant execute on function public.coordinator_recommendation_outcome(uuid, integer) to service_role;
grant execute on function public.measure_coordinator_outcomes(integer) to service_role;
grant execute on function public.coordinator_strategy_report() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-coordinator-outcomes-daily') then
    perform cron.unschedule('open-abundance-coordinator-outcomes-daily');
  end if;
  perform cron.schedule(
    'open-abundance-coordinator-outcomes-daily',
    '40 3 * * *',
    'select public.measure_coordinator_outcomes(30);'
  );
end;
$$;
