-- Trust v2 Shadow v2 (founder decision 2026-10-13, docs/GROWTH_REALITY_PLAN.md section 3.4).
-- The limit of one rater's influence on another depends only on the rater's Core level and the rater's own
-- Trust; the number and size of deals do not raise it. Repeated deals of a pair update the pair's weighted mean
-- rating instead of accumulating:
--
--   weight_i      = c + sqrt(clamp(amount_i / A, 0, amount_cap))          (bigger deals weigh more in the mean)
--   pair_score    = sum(weight_i * (rating_i - 3) / 2) / sum(weight_i)     (from -1 to +1)
--   trust_factor  = clamp(rater_trust / trust_ref, trust_factor_min, trust_factor_max)
--   pair_cap      = (pair_cap_base + pair_cap_per_level * rater_level) * trust_factor
--   contribution  = pair_cap * pair_score; the rater gets rater_share of it
--
-- rater_trust is the rater's raw_score in the latest earlier v2 snapshot (the starter value when there is none),
-- so the calculation is not recursive. Eligibility of reviews is not duplicated: the base configuration
-- (trust-shadow-v1) is rebuilt for the same date and its applied/excluded decisions are reused.
-- Still shadow-only: nothing here writes Core, Wallet, levels or public profiles.

alter table public.trust_v2_score_configs
  add column if not exists formula text not null default 'pair_budget',
  add column if not exists base_config_version text references public.trust_v2_score_configs(config_version),
  add column if not exists trust_ref numeric(20, 12),
  add column if not exists trust_factor_min numeric(20, 12),
  add column if not exists trust_factor_max numeric(20, 12);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trust_v2_score_configs_formula_check') then
    alter table public.trust_v2_score_configs
      add constraint trust_v2_score_configs_formula_check
      check (formula in ('pair_budget', 'pair_mean'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trust_v2_score_configs_pair_mean_check') then
    alter table public.trust_v2_score_configs
      add constraint trust_v2_score_configs_pair_mean_check
      check (formula <> 'pair_mean' or (
        base_config_version is not null and trust_ref > 0
        and trust_factor_min >= 0 and trust_factor_max >= trust_factor_min
      ));
  end if;
end
$$;

insert into public.trust_v2_score_configs (
  config_version, starter, amount_a, amount_c, beta, amount_cap, pair_cap_base, pair_cap_per_level,
  pair_window_days, rater_share, annual_decay, formula, base_config_version, trust_ref, trust_factor_min, trust_factor_max
) values (
  'trust-shadow-v2', 0.25, 100, 1, 0.25, 9, 2, 0.25,
  365, 0.10, 0.9, 'pair_mean', 'trust-shadow-v1', 1, 0.5, 2
)
on conflict (config_version) do nothing;

-- Keep the original calculation under its own name; rebuild_trust_v2_shadow dispatches by formula.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rebuild_trust_v2_shadow' and pronamespace = 'public'::regnamespace)
     and not exists (select 1 from pg_proc where proname = 'rebuild_trust_v2_shadow_pair_budget' and pronamespace = 'public'::regnamespace) then
    alter function public.rebuild_trust_v2_shadow(text, date) rename to rebuild_trust_v2_shadow_pair_budget;
  end if;
end
$$;

create or replace function public.rebuild_trust_v2_shadow_pair_mean(
  p_config_version text,
  p_as_of_date date
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_config public.trust_v2_score_configs%rowtype;
begin
  select * into v_config from public.trust_v2_score_configs where config_version = p_config_version;
  if not found or v_config.formula <> 'pair_mean' then
    raise exception 'Unknown pair_mean Trust v2 configuration.' using errcode = '22023';
  end if;

  -- Refresh the base snapshot: it decides which reviews are eligible as of this date.
  perform public.rebuild_trust_v2_shadow_pair_budget(v_config.base_config_version, p_as_of_date);
  perform pg_advisory_xact_lock(hashtext('trust_v2_shadow:' || p_config_version || ':' || p_as_of_date::text));

  delete from public.trust_v2_shadow_contributions where config_version = p_config_version and as_of_date = p_as_of_date;
  delete from public.trust_v2_shadow_summaries where config_version = p_config_version and as_of_date = p_as_of_date;

  -- Starter, Trust-lite diagnostics and excluded reviews carry over unchanged (starter uses this config's value).
  insert into public.trust_v2_shadow_contributions (
    config_version, as_of_date, source_type, source_id, disposition, exclusion_reasons, source_occurred_at,
    target_user_id, rater_user_id, deal_id, listing_id, rating, amount, currency_code, rater_core_level,
    rater_core_level_source, starter_delta, raw_delta, decay_periods, decayed_target_delta
  )
  select
    p_config_version, p_as_of_date, base.source_type, base.source_id, base.disposition, base.exclusion_reasons,
    base.source_occurred_at, base.target_user_id, base.rater_user_id, base.deal_id, base.listing_id, base.rating,
    base.amount, base.currency_code, base.rater_core_level, base.rater_core_level_source,
    case when base.source_type = 'starter' then v_config.starter else 0 end,
    case when base.source_type = 'starter' then v_config.starter else 0 end,
    base.decay_periods,
    case when base.source_type = 'starter' then v_config.starter * power(v_config.annual_decay, base.decay_periods) else 0 end
  from public.trust_v2_shadow_contributions base
  where base.config_version = v_config.base_config_version
    and base.as_of_date = p_as_of_date
    and (base.source_type in ('starter', 'trust_lite') or base.disposition = 'excluded');

  with reviews as (
    select
      base.*,
      v_config.amount_c + sqrt(least(greatest(base.amount / v_config.amount_a, 0), v_config.amount_cap)) as weight
    from public.trust_v2_shadow_contributions base
    where base.config_version = v_config.base_config_version
      and base.as_of_date = p_as_of_date
      and base.source_type = 'marketplace_review'
      and base.disposition = 'applied'
  ),
  previous_trust as (
    select distinct on (summary.user_id) summary.user_id, summary.raw_score
    from public.trust_v2_shadow_summaries summary
    where summary.config_version = p_config_version and summary.as_of_date < p_as_of_date
    order by summary.user_id, summary.as_of_date desc
  ),
  pairs as (
    select
      reviews.rater_user_id,
      reviews.target_user_id,
      count(*) as review_count,
      sum(reviews.weight) as weight_sum,
      sum(reviews.weight * (reviews.rating - 3.0) / 2.0) / sum(reviews.weight) as pair_score,
      (array_agg(reviews.rater_core_level order by reviews.source_occurred_at desc, reviews.source_id desc))[1] as rater_level,
      max(reviews.source_occurred_at) as last_review_at
    from reviews
    group by reviews.rater_user_id, reviews.target_user_id
  ),
  pair_effects as (
    select
      pairs.*,
      (v_config.pair_cap_base + v_config.pair_cap_per_level * pairs.rater_level)
        * least(greatest(coalesce(previous_trust.raw_score, v_config.starter) / v_config.trust_ref, v_config.trust_factor_min), v_config.trust_factor_max)
        as pair_cap,
      greatest(0, extract(year from p_as_of_date) - extract(year from pairs.last_review_at at time zone 'UTC'))::integer as decay_periods
    from pairs
    left join previous_trust on previous_trust.user_id = pairs.rater_user_id
  )
  insert into public.trust_v2_shadow_contributions (
    config_version, as_of_date, source_type, source_id, disposition, exclusion_reasons, source_occurred_at,
    target_user_id, rater_user_id, deal_id, listing_id, rating, amount, currency_code, rater_core_level,
    rater_core_level_source, amount_factor, pair_cap, raw_delta, applied_target_delta, applied_rater_delta,
    pair_cap_applied, decay_periods, decayed_target_delta, decayed_rater_delta
  )
  select
    p_config_version, p_as_of_date, reviews.source_type, reviews.source_id, 'applied', '{}'::text[],
    reviews.source_occurred_at, reviews.target_user_id, reviews.rater_user_id, reviews.deal_id, reviews.listing_id,
    reviews.rating, reviews.amount, reviews.currency_code, reviews.rater_core_level, reviews.rater_core_level_source,
    reviews.weight,
    effect.pair_cap,
    -- What this review alone would contribute at the pair limit.
    effect.pair_cap * (reviews.rating - 3.0) / 2.0,
    -- The pair contribution split by weight, so the pair total equals pair_cap * pair_score.
    effect.pair_cap * effect.pair_score * reviews.weight / effect.weight_sum,
    v_config.rater_share * effect.pair_cap * effect.pair_score * reviews.weight / effect.weight_sum,
    effect.review_count > 1,
    effect.decay_periods,
    effect.pair_cap * effect.pair_score * reviews.weight / effect.weight_sum * power(v_config.annual_decay, effect.decay_periods),
    v_config.rater_share * effect.pair_cap * effect.pair_score * reviews.weight / effect.weight_sum * power(v_config.annual_decay, effect.decay_periods)
  from reviews
  join pair_effects effect
    on effect.rater_user_id = reviews.rater_user_id and effect.target_user_id = reviews.target_user_id;

  perform public.summarize_trust_v2_shadow(p_config_version, p_as_of_date);
  return public.get_trust_v2_shadow_report(p_config_version, p_as_of_date);
end;
$$;

-- Per-user totals from contributions (same shape as the original calculation's summaries).
create or replace function public.summarize_trust_v2_shadow(
  p_config_version text,
  p_as_of_date date
) returns void
language sql
security invoker
set search_path = ''
as $$
  with user_facts as (
    select target_user_id as user_id, source_type, disposition, raw_delta, pair_cap_applied
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and target_user_id is not null
    union all
    select rater_user_id, source_type, disposition, raw_delta, pair_cap_applied
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and rater_user_id is not null
  ),
  effects as (
    select target_user_id as user_id, decayed_target_delta as starter_score, 0::numeric as target_delta, 0::numeric as rater_delta
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and source_type = 'starter'
    union all
    select target_user_id, 0, decayed_target_delta, 0
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and source_type = 'marketplace_review'
    union all
    select rater_user_id, 0, 0, decayed_rater_delta
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and source_type = 'marketplace_review'
  ),
  effect_totals as (
    select user_id, sum(starter_score) as starter_score, sum(target_delta) as target_delta, sum(rater_delta) as rater_delta
    from effects where user_id is not null group by user_id
  ),
  fact_totals as (
    select
      user_id,
      count(*) filter (where source_type = 'marketplace_review' and disposition = 'applied')::integer as eligible_review_count,
      count(*) filter (where source_type = 'marketplace_review' and disposition = 'applied' and raw_delta > 0)::integer as positive_review_count,
      count(*) filter (where source_type = 'marketplace_review' and disposition = 'applied' and raw_delta = 0)::integer as neutral_review_count,
      count(*) filter (where source_type = 'marketplace_review' and disposition = 'applied' and raw_delta < 0)::integer as negative_review_count,
      count(*) filter (where source_type = 'marketplace_review' and disposition = 'applied' and pair_cap_applied)::integer as capped_review_count,
      count(*) filter (where source_type = 'marketplace_review' and disposition = 'excluded')::integer as excluded_source_count,
      count(*) filter (where source_type = 'trust_lite' and disposition = 'diagnostic_only')::integer as trust_lite_event_count
    from user_facts group by user_id
  ),
  users as (
    select user_id from effect_totals
    union
    select user_id from fact_totals
  )
  insert into public.trust_v2_shadow_summaries (
    config_version, as_of_date, user_id, starter_score, target_review_delta, rater_review_delta,
    raw_score, eligible_review_count, positive_review_count, neutral_review_count,
    negative_review_count, capped_review_count, excluded_source_count, trust_lite_event_count
  )
  select
    p_config_version, p_as_of_date, users.user_id,
    coalesce(effects.starter_score, 0), coalesce(effects.target_delta, 0), coalesce(effects.rater_delta, 0),
    coalesce(effects.starter_score, 0) + coalesce(effects.target_delta, 0) + coalesce(effects.rater_delta, 0),
    coalesce(facts.eligible_review_count, 0), coalesce(facts.positive_review_count, 0), coalesce(facts.neutral_review_count, 0),
    coalesce(facts.negative_review_count, 0), coalesce(facts.capped_review_count, 0), coalesce(facts.excluded_source_count, 0),
    coalesce(facts.trust_lite_event_count, 0)
  from users
  left join effect_totals effects on effects.user_id = users.user_id
  left join fact_totals facts on facts.user_id = users.user_id
  where users.user_id is not null;
$$;

create or replace function public.rebuild_trust_v2_shadow(
  p_config_version text,
  p_as_of_date date
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_formula text;
begin
  select formula into v_formula from public.trust_v2_score_configs where config_version = p_config_version;
  if v_formula = 'pair_mean' then
    return public.rebuild_trust_v2_shadow_pair_mean(p_config_version, p_as_of_date);
  end if;
  return public.rebuild_trust_v2_shadow_pair_budget(p_config_version, p_as_of_date);
end;
$$;

revoke all on function public.rebuild_trust_v2_shadow(text, date) from public, anon, authenticated;
revoke all on function public.rebuild_trust_v2_shadow_pair_budget(text, date) from public, anon, authenticated;
revoke all on function public.rebuild_trust_v2_shadow_pair_mean(text, date) from public, anon, authenticated;
revoke all on function public.summarize_trust_v2_shadow(text, date) from public, anon, authenticated;
grant execute on function public.rebuild_trust_v2_shadow(text, date) to service_role;
grant execute on function public.rebuild_trust_v2_shadow_pair_budget(text, date) to service_role;
grant execute on function public.rebuild_trust_v2_shadow_pair_mean(text, date) to service_role;
grant execute on function public.summarize_trust_v2_shadow(text, date) to service_role;
