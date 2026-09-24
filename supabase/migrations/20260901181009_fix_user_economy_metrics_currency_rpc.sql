-- Repair the production economy RPC definitions after the legacy currency data migration.
--
-- Migration 20260807130000 normalized stored currency values and constraints, but
-- the already-deployed rebuild/reconcile functions retained the old marker. Keep
-- this as a forward-only repair so environments with an immutable migration
-- history converge without editing or replaying an applied migration.

do $repair$
declare
  legacy_currency text := 'OA' || '$';
  rebuild_definition text;
  reconcile_definition text;
  source_tail text := $source_tail$
    from public.user_challenges c
    where c.user_id = p_user_id
      and c.status = 'completed'
      and c.reward_account = 'core'
      and c.reward_amount is not null
  ),
  periodized as (
$source_tail$;
  source_tail_with_current_period text := $source_tail_with_current_period$
    from public.user_challenges c
    where c.user_id = p_user_id
      and c.status = 'completed'
      and c.reward_account = 'core'
      and c.reward_amount is not null

    union all

    -- A zero-valued fact guarantees day/month/year rows for the current UTC
    -- period even when the user has no source activity in that period.
    select
      rebuild_at,
      p_user_id,
      null::uuid,
      false,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0,
      0,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0,
      0,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
  ),
  periodized as (
$source_tail_with_current_period$;
begin
  select pg_get_functiondef('public.rebuild_user_economy_metrics(uuid,date,date)'::regprocedure)
  into rebuild_definition;

  if rebuild_definition is null then
    raise exception 'rebuild_user_economy_metrics definition is missing';
  end if;

  -- Normalize line endings so the guarded body patch works for definitions
  -- originally applied from either Windows or Unix checkouts.
  rebuild_definition := replace(rebuild_definition, E'\r\n', E'\n');
  rebuild_definition := replace(rebuild_definition, legacy_currency, '$');

  if position(source_tail_with_current_period in rebuild_definition) = 0 then
    if position(source_tail in rebuild_definition) = 0 then
      raise exception 'Unexpected rebuild_user_economy_metrics source layout';
    end if;
    rebuild_definition := replace(rebuild_definition, source_tail, source_tail_with_current_period);
  end if;

  if position(legacy_currency in rebuild_definition) > 0 then
    raise exception 'Legacy currency marker remains in rebuild_user_economy_metrics';
  end if;

  execute rebuild_definition;

  select pg_get_functiondef('public.reconcile_user_economy_metrics(uuid)'::regprocedure)
  into reconcile_definition;

  if reconcile_definition is null then
    raise exception 'reconcile_user_economy_metrics definition is missing';
  end if;

  reconcile_definition := replace(reconcile_definition, legacy_currency, '$');

  if position(legacy_currency in reconcile_definition) > 0 then
    raise exception 'Legacy currency marker remains in reconcile_user_economy_metrics';
  end if;

  execute reconcile_definition;
end;
$repair$;

-- CREATE OR REPLACE preserves existing ACLs, but repeat the intended boundary
-- explicitly because both functions are SECURITY DEFINER and server-only.
revoke all on function public.rebuild_user_economy_metrics(uuid, date, date) from public, anon, authenticated;
revoke all on function public.reconcile_user_economy_metrics(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_user_economy_metrics(uuid, date, date) to service_role;
grant execute on function public.reconcile_user_economy_metrics(uuid) to service_role;

-- Rebuild only the disposable projection. Canonical Wallet/Core/deal source
-- tables are read-only inputs to these functions.
do $backfill$
declare
  v_user_id uuid;
begin
  for v_user_id in select id from auth.users loop
    perform public.rebuild_user_economy_metrics(v_user_id);
    perform public.reconcile_user_economy_metrics(v_user_id);
  end loop;
end;
$backfill$;
