-- Fix: the original Trust v2 shadow calculation (now rebuild_trust_v2_shadow_pair_budget) selected 14 columns
-- for starter rows while the snapshot and the other UNION branches have 15 (rater_core_level_source was missing),
-- so every rebuild failed with "each UNION query must have the same number of columns". The body below is the
-- original one with that single null added; nothing else changes.

create or replace function public.rebuild_trust_v2_shadow_pair_budget(
  p_config_version text,
  p_as_of_date date
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_config public.trust_v2_score_configs%rowtype;
  v_source record;
  v_positive_used numeric(30, 12);
  v_negative_used numeric(30, 12);
  v_amount_factor numeric(30, 12);
  v_pair_cap numeric(30, 12);
  v_raw_delta numeric(30, 12);
  v_applied_delta numeric(30, 12);
  v_rater_delta numeric(30, 12);
  v_decay_periods integer;
  v_cutoff timestamptz;
begin
  if p_config_version is null or p_as_of_date is null then
    raise exception 'configVersion and asOfDate are required.' using errcode = '22023';
  end if;
  if p_as_of_date > (now() at time zone 'UTC')::date then
    raise exception 'asOfDate cannot be in the future.' using errcode = '22023';
  end if;

  select * into v_config
  from public.trust_v2_score_configs
  where config_version = p_config_version;
  if not found then
    raise exception 'Unknown Trust v2 score configuration.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('trust_v2_shadow:' || p_config_version || ':' || p_as_of_date::text));
  v_cutoff := ((p_as_of_date + 1)::timestamp at time zone 'UTC');

  drop table if exists trust_v2_shadow_source_snapshot;
  create temporary table trust_v2_shadow_source_snapshot (
    source_type text not null,
    source_id uuid not null,
    source_occurred_at timestamptz not null,
    target_user_id uuid,
    rater_user_id uuid,
    starter_delta numeric(30, 12) not null default 0,
    deal_id uuid,
    listing_id uuid,
    rating numeric,
    amount numeric(30, 12),
    currency_code text,
    rater_core_level integer,
    rater_core_level_source text,
    disposition text not null,
    exclusion_reasons text[] not null default '{}'
  ) on commit drop;

  insert into trust_v2_shadow_source_snapshot (
    source_type,
    source_id,
    source_occurred_at,
    target_user_id,
    rater_user_id,
    starter_delta,
    deal_id,
    listing_id,
    rating,
    amount,
    currency_code,
    rater_core_level,
    rater_core_level_source,
    disposition,
    exclusion_reasons
  )
  with review_sources as (
    select
      review.id,
      review.created_at,
      review.seller_user_id,
      review.buyer_user_id,
      review.deal_id,
      review.listing_id,
      review.rating,
      review.status,
      review.rater_core_level,
      review.rater_core_level_source,
      deal.seller_user_id as deal_seller_user_id,
      deal.buyer_user_id as deal_buyer_user_id,
      deal.listing_id as deal_listing_id,
      deal.status as deal_status,
      deal.price_amount,
      deal.currency_code as deal_currency_code,
      escrow.status as escrow_status,
      escrow.released_at,
      payment.id as payment_id,
      payment.amount as payment_amount,
      payment.currency_code as payment_currency_code
    from public.marketplace_reviews review
    join public.marketplace_deals deal on deal.id = review.deal_id
    left join public.marketplace_escrows escrow on escrow.deal_id = deal.id
    left join lateral (
      select ledger.id, ledger.amount, ledger.currency_code
      from public.wallet_ledger ledger
      where ledger.user_id = deal.seller_user_id
        and ledger.source_type = 'marketplace_deal'
        and ledger.source_id = deal.id
        and ledger.operation_type = 'marketplace_payment'
        and ledger.direction = 'credit'
        and ledger.created_at < v_cutoff
      order by ledger.created_at asc, ledger.id asc
      limit 1
    ) payment on true
    where review.created_at < v_cutoff
  )
  select
    'starter',
    profile.user_id,
    profile.created_at,
    profile.user_id,
    null,
    v_config.starter,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'applied',
    '{}'::text[]
  from public.user_profiles profile
  where profile.created_at < v_cutoff
  union all
  select
    'marketplace_review',
    source.id,
    source.created_at,
    source.seller_user_id,
    source.buyer_user_id,
    0,
    source.deal_id,
    source.listing_id,
    source.rating,
    source.price_amount,
    source.deal_currency_code,
    source.rater_core_level,
    source.rater_core_level_source,
    case when cardinality(array_remove(array[
      case when source.status <> 'published' then 'review_not_published'::text end,
      case when source.deal_status <> 'completed' then 'deal_not_completed'::text end,
      case when source.escrow_status <> 'released' or source.released_at is null or source.released_at >= v_cutoff then 'escrow_not_released'::text end,
      case when source.price_amount <= 0 or source.deal_currency_code <> '$' then 'unsupported_amount'::text end,
      case when source.payment_id is null then 'payment_not_confirmed'::text end,
      case when source.payment_id is not null and source.payment_amount is distinct from source.price_amount then 'payment_amount_mismatch'::text end,
      case when source.payment_id is not null and source.payment_currency_code is distinct from source.deal_currency_code then 'payment_currency_mismatch'::text end,
      case when source.seller_user_id is distinct from source.deal_seller_user_id or source.buyer_user_id is distinct from source.deal_buyer_user_id then 'review_participant_mismatch'::text end,
      case when source.listing_id is distinct from source.deal_listing_id then 'review_listing_mismatch'::text end,
      case when source.rater_core_level is null then 'rater_level_missing'::text end
    ]::text[], null)) = 0 then 'applied' else 'excluded' end,
    array_remove(array[
      case when source.status <> 'published' then 'review_not_published'::text end,
      case when source.deal_status <> 'completed' then 'deal_not_completed'::text end,
      case when source.escrow_status <> 'released' or source.released_at is null or source.released_at >= v_cutoff then 'escrow_not_released'::text end,
      case when source.price_amount <= 0 or source.deal_currency_code <> '$' then 'unsupported_amount'::text end,
      case when source.payment_id is null then 'payment_not_confirmed'::text end,
      case when source.payment_id is not null and source.payment_amount is distinct from source.price_amount then 'payment_amount_mismatch'::text end,
      case when source.payment_id is not null and source.payment_currency_code is distinct from source.deal_currency_code then 'payment_currency_mismatch'::text end,
      case when source.seller_user_id is distinct from source.deal_seller_user_id or source.buyer_user_id is distinct from source.deal_buyer_user_id then 'review_participant_mismatch'::text end,
      case when source.listing_id is distinct from source.deal_listing_id then 'review_listing_mismatch'::text end,
      case when source.rater_core_level is null then 'rater_level_missing'::text end
    ]::text[], null)
  from review_sources source
  union all
  select
    'trust_lite',
    event.id,
    coalesce(event.confirmed_at, event.created_at),
    event.target_user_id,
    event.actor_user_id,
    0,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'diagnostic_only',
    array['diagnostic_only']::text[]
  from public.trust_events event
  where event.status = 'confirmed'
    and coalesce(event.confirmed_at, event.created_at) < v_cutoff;

  delete from public.trust_v2_shadow_contributions
  where config_version = p_config_version and as_of_date = p_as_of_date;
  delete from public.trust_v2_shadow_summaries
  where config_version = p_config_version and as_of_date = p_as_of_date;

  insert into public.trust_v2_shadow_contributions (
    config_version,
    as_of_date,
    source_type,
    source_id,
    disposition,
    exclusion_reasons,
    source_occurred_at,
    target_user_id,
    starter_delta,
    raw_delta,
    decay_periods,
    decayed_target_delta
  )
  select
    p_config_version,
    p_as_of_date,
    source_type,
    source_id,
    disposition,
    exclusion_reasons,
    source_occurred_at,
    target_user_id,
    starter_delta,
    starter_delta,
    greatest(0, extract(year from p_as_of_date) - extract(year from source_occurred_at at time zone 'UTC'))::integer,
    starter_delta * power(v_config.annual_decay, greatest(0, extract(year from p_as_of_date) - extract(year from source_occurred_at at time zone 'UTC')))
  from trust_v2_shadow_source_snapshot
  where source_type = 'starter';

  for v_source in
    select *
    from trust_v2_shadow_source_snapshot
    where source_type = 'marketplace_review'
    order by source_occurred_at asc, source_id asc
  loop
    if v_source.disposition = 'excluded' then
      insert into public.trust_v2_shadow_contributions (
        config_version, as_of_date, source_type, source_id, disposition, exclusion_reasons,
        source_occurred_at, target_user_id, rater_user_id, deal_id, listing_id, rating, amount,
        currency_code, rater_core_level, rater_core_level_source
      ) values (
        p_config_version, p_as_of_date, v_source.source_type, v_source.source_id, v_source.disposition,
        v_source.exclusion_reasons, v_source.source_occurred_at, v_source.target_user_id, v_source.rater_user_id,
        v_source.deal_id, v_source.listing_id, v_source.rating, v_source.amount, v_source.currency_code,
        v_source.rater_core_level, v_source.rater_core_level_source
      );
      continue;
    end if;

    v_amount_factor := v_config.amount_c + sqrt(
      least(greatest(v_source.amount / v_config.amount_a, 0), v_config.amount_cap)
    );
    v_raw_delta := v_config.beta * (v_source.rating - 3.0) * v_amount_factor;
    v_pair_cap := v_config.pair_cap_base + v_config.pair_cap_per_level * v_source.rater_core_level;

    select
      coalesce(sum(case when applied_target_delta > 0 then applied_target_delta else 0 end), 0),
      coalesce(sum(case when applied_target_delta < 0 then abs(applied_target_delta) else 0 end), 0)
    into v_positive_used, v_negative_used
    from public.trust_v2_shadow_contributions previous
    where previous.config_version = p_config_version
      and previous.as_of_date = p_as_of_date
      and previous.source_type = 'marketplace_review'
      and previous.disposition = 'applied'
      and previous.rater_user_id = v_source.rater_user_id
      and previous.target_user_id = v_source.target_user_id
      and previous.source_occurred_at > v_source.source_occurred_at - make_interval(days => v_config.pair_window_days)
      and (
        previous.source_occurred_at < v_source.source_occurred_at
        or (previous.source_occurred_at = v_source.source_occurred_at and previous.source_id < v_source.source_id)
      );

    if v_raw_delta > 0 then
      v_applied_delta := least(v_raw_delta, greatest(v_pair_cap - v_positive_used, 0));
    elsif v_raw_delta < 0 then
      v_applied_delta := greatest(v_raw_delta, -greatest(v_pair_cap - v_negative_used, 0));
    else
      v_applied_delta := 0;
    end if;
    v_rater_delta := v_config.rater_share * v_applied_delta;
    v_decay_periods := greatest(0, extract(year from p_as_of_date) - extract(year from v_source.source_occurred_at at time zone 'UTC'))::integer;

    insert into public.trust_v2_shadow_contributions (
      config_version, as_of_date, source_type, source_id, disposition, exclusion_reasons,
      source_occurred_at, target_user_id, rater_user_id, deal_id, listing_id, rating, amount,
      currency_code, rater_core_level, rater_core_level_source, amount_factor, pair_cap,
      positive_pair_used_before, negative_pair_used_before, raw_delta, applied_target_delta,
      applied_rater_delta, pair_cap_applied, decay_periods, decayed_target_delta, decayed_rater_delta
    ) values (
      p_config_version, p_as_of_date, v_source.source_type, v_source.source_id, v_source.disposition,
      v_source.exclusion_reasons, v_source.source_occurred_at, v_source.target_user_id, v_source.rater_user_id,
      v_source.deal_id, v_source.listing_id, v_source.rating, v_source.amount, v_source.currency_code,
      v_source.rater_core_level, v_source.rater_core_level_source, v_amount_factor, v_pair_cap,
      v_positive_used, v_negative_used, v_raw_delta, v_applied_delta, v_rater_delta,
      abs(v_applied_delta) < abs(v_raw_delta), v_decay_periods,
      v_applied_delta * power(v_config.annual_decay, v_decay_periods),
      v_rater_delta * power(v_config.annual_decay, v_decay_periods)
    );
  end loop;

  insert into public.trust_v2_shadow_contributions (
    config_version, as_of_date, source_type, source_id, disposition, exclusion_reasons,
    source_occurred_at, target_user_id, rater_user_id, decay_periods
  )
  select
    p_config_version,
    p_as_of_date,
    source_type,
    source_id,
    disposition,
    exclusion_reasons,
    source_occurred_at,
    target_user_id,
    rater_user_id,
    greatest(0, extract(year from p_as_of_date) - extract(year from source_occurred_at at time zone 'UTC'))::integer
  from trust_v2_shadow_source_snapshot
  where source_type = 'trust_lite';

  with user_facts as (
    select target_user_id as user_id, source_id, source_type, disposition, raw_delta, pair_cap_applied
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and target_user_id is not null
    union all
    select rater_user_id, source_id, source_type, disposition, raw_delta, pair_cap_applied
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and rater_user_id is not null
  ),
  effects as (
    select target_user_id as user_id, decayed_target_delta as starter_score, 0::numeric as target_delta, 0::numeric as rater_delta
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and source_type = 'starter'
    union all
    select target_user_id, 0::numeric, decayed_target_delta, 0::numeric
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and source_type = 'marketplace_review'
    union all
    select rater_user_id, 0::numeric, 0::numeric, decayed_rater_delta
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and source_type = 'marketplace_review'
  ),
  effect_totals as (
    select user_id, sum(starter_score) as starter_score, sum(target_delta) as target_delta, sum(rater_delta) as rater_delta
    from effects
    group by user_id
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
    from user_facts
    group by user_id
  ),
  users as (
    select user_id from public.user_profiles where created_at < v_cutoff
    union
    select target_user_id
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and target_user_id is not null
    union
    select rater_user_id
    from public.trust_v2_shadow_contributions
    where config_version = p_config_version and as_of_date = p_as_of_date and rater_user_id is not null
  )
  insert into public.trust_v2_shadow_summaries (
    config_version, as_of_date, user_id, starter_score, target_review_delta, rater_review_delta,
    raw_score, eligible_review_count, positive_review_count, neutral_review_count,
    negative_review_count, capped_review_count, excluded_source_count, trust_lite_event_count
  )
  select
    p_config_version,
    p_as_of_date,
    starter.user_id,
    coalesce(effects.starter_score, 0),
    coalesce(effects.target_delta, 0),
    coalesce(effects.rater_delta, 0),
    coalesce(effects.starter_score, 0) + coalesce(effects.target_delta, 0) + coalesce(effects.rater_delta, 0),
    coalesce(facts.eligible_review_count, 0),
    coalesce(facts.positive_review_count, 0),
    coalesce(facts.neutral_review_count, 0),
    coalesce(facts.negative_review_count, 0),
    coalesce(facts.capped_review_count, 0),
    coalesce(facts.excluded_source_count, 0),
    coalesce(facts.trust_lite_event_count, 0)
  from users starter
  left join effect_totals effects on effects.user_id = starter.user_id
  left join fact_totals facts on facts.user_id = starter.user_id;

  return public.get_trust_v2_shadow_report(p_config_version, p_as_of_date);
end;
$$;

revoke all on function public.rebuild_trust_v2_shadow_pair_budget(text, date) from public, anon, authenticated;
grant execute on function public.rebuild_trust_v2_shadow_pair_budget(text, date) to service_role;
