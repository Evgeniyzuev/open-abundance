-- User economy metrics and challenge reward accounting.
-- This is a rebuildable read model. It never replaces Wallet/Core/deal truth.

alter table public.user_challenges
  add column if not exists reward_account text,
  add column if not exists reward_amount numeric(30, 12),
  add column if not exists reward_settled_at timestamptz,
  add column if not exists reward_idempotency_key text;

alter table public.user_challenges
  drop constraint if exists user_challenges_reward_account_check;
alter table public.user_challenges
  add constraint user_challenges_reward_account_check
  check (reward_account is null or reward_account in ('core', 'wallet'));

alter table public.user_challenges
  drop constraint if exists user_challenges_reward_amount_check;
alter table public.user_challenges
  add constraint user_challenges_reward_amount_check
  check (reward_amount is null or reward_amount >= 0);

create unique index if not exists user_challenges_reward_idempotency_idx
on public.user_challenges (reward_idempotency_key)
where reward_idempotency_key is not null;

create or replace function public.complete_user_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_reward_account text,
  p_reward_amount numeric
)
returns table (
  challenge_status text,
  reward_claimed boolean,
  rewarded_account text,
  rewarded_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.user_challenges%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_wallet_balance numeric(30, 12);
  reward_key text;
begin
  if p_user_id is null or p_challenge_id is null then
    raise exception 'User and challenge are required.' using errcode = '22023';
  end if;
  if p_reward_account not in ('core', 'wallet') or p_reward_amount is null or p_reward_amount < 0 then
    raise exception 'Invalid challenge reward.' using errcode = '22023';
  end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update
    set updated_at = now();

  select *
  into existing
  from public.user_challenges
  where user_id = p_user_id
    and challenge_id = p_challenge_id
  for update;

  if existing.status = 'completed' then
    return query
    select
      existing.status,
      false,
      existing.reward_account,
      existing.reward_amount;
    return;
  end if;

  reward_key := 'challenge:' || existing.id::text || ':reward';

  if p_reward_account = 'core' and p_reward_amount > 0 then
    update public.core_accounts
    set balance = balance + p_reward_amount,
        updated_at = now()
    where user_id = p_user_id;
    if not found then
      raise exception 'Core account is not created yet.' using errcode = 'P0002';
    end if;
  elsif p_reward_account = 'wallet' and p_reward_amount > 0 then
    select *
    into wallet
    from public.wallet_accounts
    where user_id = p_user_id
    for update;

    if not found then
      raise exception 'Wallet is not created yet.' using errcode = 'P0002';
    end if;

    next_wallet_balance := wallet.balance + p_reward_amount;

    update public.wallet_accounts
    set balance = next_wallet_balance,
        updated_at = now()
    where user_id = p_user_id;

    insert into public.wallet_ledger (
      user_id,
      direction,
      amount,
      currency_code,
      operation_type,
      source_type,
      source_id,
      balance_after,
      idempotency_key,
      metadata
    )
    values (
      p_user_id,
      'credit',
      p_reward_amount,
      wallet.currency_code,
      'challenge_reward',
      'challenge',
      existing.id,
      next_wallet_balance,
      reward_key,
      jsonb_build_object('challenge_id', p_challenge_id, 'reward_account', p_reward_account)
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  update public.user_challenges
  set status = 'completed',
      reward_account = p_reward_account,
      reward_amount = p_reward_amount,
      reward_settled_at = now(),
      reward_idempotency_key = reward_key,
      updated_at = now()
  where id = existing.id;

  return query
  select 'completed'::text, true, p_reward_account, p_reward_amount;
end;
$$;

revoke all on function public.complete_user_challenge(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.complete_user_challenge(uuid, uuid, text, numeric) to service_role;

create table if not exists public.user_economy_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('day', 'month', 'year', 'lifetime')),
  period_key text not null,
  currency_code text not null default 'OA$' check (currency_code = 'OA$'),
  marketplace_sales_gross numeric(30, 12) not null default 0 check (marketplace_sales_gross >= 0),
  marketplace_purchases_gross numeric(30, 12) not null default 0 check (marketplace_purchases_gross >= 0),
  marketplace_sales_net numeric(30, 12) not null default 0 check (marketplace_sales_net >= 0),
  marketplace_platform_fees_paid numeric(30, 12) not null default 0 check (marketplace_platform_fees_paid >= 0),
  marketplace_refunds_total numeric(30, 12) not null default 0 check (marketplace_refunds_total >= 0),
  marketplace_completed_sales_count integer not null default 0 check (marketplace_completed_sales_count >= 0),
  marketplace_completed_purchase_count integer not null default 0 check (marketplace_completed_purchase_count >= 0),
  marketplace_unique_counterparties_count integer not null default 0 check (marketplace_unique_counterparties_count >= 0),
  participation_balance numeric(30, 12) generated always as (marketplace_purchases_gross - marketplace_sales_gross) stored,
  wallet_inflows_total numeric(30, 12) not null default 0 check (wallet_inflows_total >= 0),
  wallet_outflows_total numeric(30, 12) not null default 0 check (wallet_outflows_total >= 0),
  wallet_transfer_in numeric(30, 12) not null default 0 check (wallet_transfer_in >= 0),
  wallet_transfer_out numeric(30, 12) not null default 0 check (wallet_transfer_out >= 0),
  wallet_challenge_rewards numeric(30, 12) not null default 0 check (wallet_challenge_rewards >= 0),
  wallet_refunds_in numeric(30, 12) not null default 0 check (wallet_refunds_in >= 0),
  wallet_payout_from_core numeric(30, 12) not null default 0 check (wallet_payout_from_core >= 0),
  wallet_core_topups numeric(30, 12) not null default 0 check (wallet_core_topups >= 0),
  external_inflows_total numeric(30, 12) not null default 0 check (external_inflows_total >= 0),
  external_outflows_total numeric(30, 12) not null default 0 check (external_outflows_total >= 0),
  external_deposit_count integer not null default 0 check (external_deposit_count >= 0),
  external_withdrawal_count integer not null default 0 check (external_withdrawal_count >= 0),
  core_growth_total numeric(30, 12) not null default 0 check (core_growth_total >= 0),
  core_growth_wallet_topups numeric(30, 12) not null default 0 check (core_growth_wallet_topups >= 0),
  core_growth_challenge_rewards numeric(30, 12) not null default 0 check (core_growth_challenge_rewards >= 0),
  core_growth_reinvest numeric(30, 12) not null default 0 check (core_growth_reinvest >= 0),
  core_growth_leader_bonus numeric(30, 12) not null default 0 check (core_growth_leader_bonus >= 0),
  core_growth_other_system numeric(30, 12) not null default 0 check (core_growth_other_system >= 0),
  core_accrual_gross numeric(30, 12) not null default 0 check (core_accrual_gross >= 0),
  core_balance_start numeric(30, 12) not null default 0 check (core_balance_start >= 0),
  core_balance_end numeric(30, 12) not null default 0 check (core_balance_end >= 0),
  core_level_end integer not null default 0 check (core_level_end >= 0),
  schema_version integer not null default 1 check (schema_version > 0),
  source_watermark timestamptz not null default now(),
  is_reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reconciled_at timestamptz,
  primary key (user_id, period_type, period_key, currency_code),
  check (
    (period_type = 'day' and period_key ~ '^\d{4}-\d{2}-\d{2}$')
    or (period_type = 'month' and period_key ~ '^\d{4}-\d{2}$')
    or (period_type = 'year' and period_key ~ '^\d{4}$')
    or (period_type = 'lifetime' and period_key = 'lifetime')
  )
);

create index if not exists user_economy_metrics_user_period_idx
on public.user_economy_metrics (user_id, period_type, period_key);

create table if not exists public.user_economy_metric_visibility (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_key text not null check (metric_key in (
    'wallet_inflows_total',
    'wallet_outflows_total',
    'marketplace_sales_gross',
    'marketplace_purchases_gross',
    'marketplace_completed_sales_count',
    'marketplace_completed_purchase_count',
    'core_growth_total',
    'core_level_end'
  )),
  period_type text not null check (period_type in ('day', 'month', 'year', 'lifetime')),
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric_key, period_type)
);

alter table public.user_economy_metrics enable row level security;
alter table public.user_economy_metric_visibility enable row level security;

revoke all on table public.user_economy_metrics from public, anon, authenticated;
grant select on table public.user_economy_metrics to authenticated;
grant select, insert, update, delete on table public.user_economy_metrics to service_role;

drop policy if exists "Users can read own economy metrics" on public.user_economy_metrics;
create policy "Users can read own economy metrics"
on public.user_economy_metrics
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.user_economy_metric_visibility from public, anon, authenticated;
grant select on table public.user_economy_metric_visibility to authenticated;
grant select, insert, update, delete on table public.user_economy_metric_visibility to service_role;

drop policy if exists "Users can read own economy visibility" on public.user_economy_metric_visibility;
create policy "Users can read own economy visibility"
on public.user_economy_metric_visibility
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.rebuild_user_economy_metrics(
  p_user_id uuid,
  p_from_date date default null,
  p_to_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count integer;
  rebuild_at timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'User is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  delete from public.user_economy_metrics
  where user_id = p_user_id;

  with source_facts (
    occurred_at,
    user_id,
    counterparty_user_id,
    is_marketplace_fact,
    marketplace_sales_gross,
    marketplace_purchases_gross,
    marketplace_sales_net,
    marketplace_platform_fees_paid,
    marketplace_refunds_total,
    marketplace_completed_sales_count,
    marketplace_completed_purchase_count,
    wallet_inflows_total,
    wallet_outflows_total,
    wallet_transfer_in,
    wallet_transfer_out,
    wallet_challenge_rewards,
    wallet_refunds_in,
    wallet_payout_from_core,
    wallet_core_topups,
    external_inflows_total,
    external_outflows_total,
    external_deposit_count,
    external_withdrawal_count,
    core_growth_wallet_topups,
    core_growth_challenge_rewards,
    core_growth_reinvest,
    core_growth_leader_bonus,
    core_growth_other_system,
    core_accrual_gross
  ) as (
    select
      coalesce(e.released_at, d.completed_at, d.updated_at),
      d.buyer_user_id,
      d.seller_user_id,
      true,
      0::numeric,
      d.price_amount,
      0::numeric,
      0::numeric,
      0::numeric,
      0,
      1,
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
    from public.marketplace_deals d
    left join public.marketplace_escrows e on e.deal_id = d.id
    where d.buyer_user_id = p_user_id
      and d.status = 'completed'
      and coalesce(e.released_at, d.completed_at) is not null

    union all

    select
      coalesce(e.released_at, d.completed_at, d.updated_at),
      d.seller_user_id,
      d.buyer_user_id,
      true,
      d.price_amount,
      0::numeric,
      d.price_amount,
      0::numeric,
      0::numeric,
      1,
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
    from public.marketplace_deals d
    left join public.marketplace_escrows e on e.deal_id = d.id
    where d.seller_user_id = p_user_id
      and d.status = 'completed'
      and coalesce(e.released_at, d.completed_at) is not null

    union all

    select
      coalesce(e.refunded_at, d.updated_at),
      d.buyer_user_id,
      d.seller_user_id,
      true,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      d.price_amount,
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
    from public.marketplace_deals d
    left join public.marketplace_escrows e on e.deal_id = d.id
    where d.buyer_user_id = p_user_id
      and d.status in ('cancelled', 'expired', 'refunded')
      and e.refunded_at is not null

    union all

    select
      l.created_at,
      l.user_id,
      l.counterparty_user_id,
      false,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0,
      0,
      case when l.direction = 'credit' then l.amount else 0 end,
      case when l.direction = 'debit' then l.amount else 0 end,
      case when l.operation_type = 'wallet_transfer' and l.direction = 'credit' then l.amount else 0 end,
      case when l.operation_type = 'wallet_transfer' and l.direction = 'debit' then l.amount else 0 end,
      case when l.operation_type = 'challenge_reward' and l.direction = 'credit' then l.amount else 0 end,
      case when l.operation_type = 'marketplace_refund' and l.direction = 'credit' then l.amount else 0 end,
      0::numeric,
      case when l.operation_type = 'wallet_core_topup' and l.direction = 'debit' then l.amount else 0 end,
      case when l.operation_type = 'crypto_deposit' and l.direction = 'credit' then l.amount else 0 end,
      case when l.operation_type = 'crypto_withdrawal'
        and l.direction = 'debit'
        and coalesce(l.metadata ->> 'withdrawal_status', '') in ('broadcast', 'confirmed') then l.amount else 0 end,
      case when l.operation_type = 'crypto_deposit' and l.direction = 'credit' then 1 else 0 end,
      case when l.operation_type = 'crypto_withdrawal'
        and l.direction = 'debit'
        and coalesce(l.metadata ->> 'withdrawal_status', '') in ('broadcast', 'confirmed') then 1 else 0 end,
      case when l.operation_type = 'wallet_core_topup' and l.direction = 'debit' then l.amount else 0 end,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    from public.wallet_ledger l
    where l.user_id = p_user_id
      and l.currency_code = 'OA$'

    union all

    select
      (a.accrual_date::timestamp at time zone 'UTC'),
      a.user_id,
      null::uuid,
      false,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0,
      0,
      a.wallet_amount,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      a.wallet_amount,
      0::numeric,
      0::numeric,
      0::numeric,
      0,
      0,
      0::numeric,
      0::numeric,
      a.core_amount,
      0::numeric,
      0::numeric,
      a.gross_amount
    from public.daily_core_accruals a
    where a.user_id = p_user_id

    union all

    select
      (r.bonus_date::timestamp at time zone 'UTC'),
      r.leader_user_id,
      r.source_user_id,
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
      0,
      0,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      r.reward_amount,
      0::numeric,
      0::numeric
    from public.team_core_growth_rewards r
    where r.leader_user_id = p_user_id

    union all

    select
      coalesce(c.reward_settled_at, c.updated_at),
      c.user_id,
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
      0,
      0,
      0::numeric,
      0::numeric,
      case when c.reward_account = 'core' then c.reward_amount else 0 end,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric
    from public.user_challenges c
    where c.user_id = p_user_id
      and c.status = 'completed'
      and c.reward_account = 'core'
      and c.reward_amount is not null
  ),
  periodized as (
    select sf.*, p.period_type, p.period_key, p.period_start, p.period_end
    from source_facts sf
    cross join lateral (
      values
        ('day'::text, date_trunc('day', sf.occurred_at), date_trunc('day', sf.occurred_at) + interval '1 day', to_char(sf.occurred_at at time zone 'UTC', 'YYYY-MM-DD')),
        ('month'::text, date_trunc('month', sf.occurred_at), date_trunc('month', sf.occurred_at) + interval '1 month', to_char(sf.occurred_at at time zone 'UTC', 'YYYY-MM')),
        ('year'::text, date_trunc('year', sf.occurred_at), date_trunc('year', sf.occurred_at) + interval '1 year', to_char(sf.occurred_at at time zone 'UTC', 'YYYY')),
        ('lifetime'::text, '-infinity'::timestamptz, 'infinity'::timestamptz, 'lifetime'::text)
    ) p(period_type, period_start, period_end, period_key)
  ),
  period_ranges as (
    select distinct p.period_type, p.period_key, p.period_start, p.period_end
    from periodized p
    union
    select 'lifetime', 'lifetime', '-infinity'::timestamptz, 'infinity'::timestamptz
  ),
  aggregated as (
    select
      p.period_type,
      p.period_key,
      coalesce(sum(p.marketplace_sales_gross), 0)::numeric(30, 12) as marketplace_sales_gross,
      coalesce(sum(p.marketplace_purchases_gross), 0)::numeric(30, 12) as marketplace_purchases_gross,
      coalesce(sum(p.marketplace_sales_net), 0)::numeric(30, 12) as marketplace_sales_net,
      coalesce(sum(p.marketplace_platform_fees_paid), 0)::numeric(30, 12) as marketplace_platform_fees_paid,
      coalesce(sum(p.marketplace_refunds_total), 0)::numeric(30, 12) as marketplace_refunds_total,
      coalesce(sum(p.marketplace_completed_sales_count), 0)::integer as marketplace_completed_sales_count,
      coalesce(sum(p.marketplace_completed_purchase_count), 0)::integer as marketplace_completed_purchase_count,
      count(distinct p.counterparty_user_id) filter (where p.is_marketplace_fact and p.counterparty_user_id is not null)::integer as marketplace_unique_counterparties_count,
      coalesce(sum(p.wallet_inflows_total), 0)::numeric(30, 12) as wallet_inflows_total,
      coalesce(sum(p.wallet_outflows_total), 0)::numeric(30, 12) as wallet_outflows_total,
      coalesce(sum(p.wallet_transfer_in), 0)::numeric(30, 12) as wallet_transfer_in,
      coalesce(sum(p.wallet_transfer_out), 0)::numeric(30, 12) as wallet_transfer_out,
      coalesce(sum(p.wallet_challenge_rewards), 0)::numeric(30, 12) as wallet_challenge_rewards,
      coalesce(sum(p.wallet_refunds_in), 0)::numeric(30, 12) as wallet_refunds_in,
      coalesce(sum(p.wallet_payout_from_core), 0)::numeric(30, 12) as wallet_payout_from_core,
      coalesce(sum(p.wallet_core_topups), 0)::numeric(30, 12) as wallet_core_topups,
      coalesce(sum(p.external_inflows_total), 0)::numeric(30, 12) as external_inflows_total,
      coalesce(sum(p.external_outflows_total), 0)::numeric(30, 12) as external_outflows_total,
      coalesce(sum(p.external_deposit_count), 0)::integer as external_deposit_count,
      coalesce(sum(p.external_withdrawal_count), 0)::integer as external_withdrawal_count,
      coalesce(sum(p.core_growth_wallet_topups), 0)::numeric(30, 12) as core_growth_wallet_topups,
      coalesce(sum(p.core_growth_challenge_rewards), 0)::numeric(30, 12) as core_growth_challenge_rewards,
      coalesce(sum(p.core_growth_reinvest), 0)::numeric(30, 12) as core_growth_reinvest,
      coalesce(sum(p.core_growth_leader_bonus), 0)::numeric(30, 12) as core_growth_leader_bonus,
      coalesce(sum(p.core_growth_other_system), 0)::numeric(30, 12) as core_growth_other_system,
      coalesce(sum(p.core_accrual_gross), 0)::numeric(30, 12) as core_accrual_gross
    from periodized p
    group by p.period_type, p.period_key
  ),
  core_facts as (
    select
      l.created_at as occurred_at,
      case when l.operation_type = 'wallet_core_topup' then l.amount else 0 end::numeric as growth_amount
    from public.wallet_ledger l
    where l.user_id = p_user_id
      and l.operation_type = 'wallet_core_topup'
      and l.direction = 'debit'
    union all
    select coalesce(c.reward_settled_at, c.updated_at), c.reward_amount
    from public.user_challenges c
    where c.user_id = p_user_id and c.status = 'completed' and c.reward_account = 'core' and c.reward_amount is not null
    union all
    select (a.accrual_date::timestamp at time zone 'UTC'), a.core_amount
    from public.daily_core_accruals a
    where a.user_id = p_user_id
    union all
    select (r.bonus_date::timestamp at time zone 'UTC'), r.reward_amount
    from public.team_core_growth_rewards r
    where r.leader_user_id = p_user_id
  ),
  with_bounds as (
    select
      r.period_type,
      r.period_key,
      coalesce((select sum(cf.growth_amount) from core_facts cf where cf.occurred_at < r.period_start), 0)::numeric(30, 12) as core_balance_start,
      coalesce((select sum(cf.growth_amount) from core_facts cf where cf.occurred_at < r.period_end), 0)::numeric(30, 12) as core_balance_end
    from period_ranges r
  )
  insert into public.user_economy_metrics (
    user_id,
    period_type,
    period_key,
    currency_code,
    marketplace_sales_gross,
    marketplace_purchases_gross,
    marketplace_sales_net,
    marketplace_platform_fees_paid,
    marketplace_refunds_total,
    marketplace_completed_sales_count,
    marketplace_completed_purchase_count,
    marketplace_unique_counterparties_count,
    wallet_inflows_total,
    wallet_outflows_total,
    wallet_transfer_in,
    wallet_transfer_out,
    wallet_challenge_rewards,
    wallet_refunds_in,
    wallet_payout_from_core,
    wallet_core_topups,
    external_inflows_total,
    external_outflows_total,
    external_deposit_count,
    external_withdrawal_count,
    core_growth_total,
    core_growth_wallet_topups,
    core_growth_challenge_rewards,
    core_growth_reinvest,
    core_growth_leader_bonus,
    core_growth_other_system,
    core_accrual_gross,
    core_balance_start,
    core_balance_end,
    core_level_end,
    schema_version,
    source_watermark,
    is_reconciled,
    updated_at
  )
  select
    p_user_id,
    b.period_type,
    b.period_key,
    'OA$',
    coalesce(a.marketplace_sales_gross, 0),
    coalesce(a.marketplace_purchases_gross, 0),
    coalesce(a.marketplace_sales_net, 0),
    coalesce(a.marketplace_platform_fees_paid, 0),
    coalesce(a.marketplace_refunds_total, 0),
    coalesce(a.marketplace_completed_sales_count, 0),
    coalesce(a.marketplace_completed_purchase_count, 0),
    coalesce(a.marketplace_unique_counterparties_count, 0),
    coalesce(a.wallet_inflows_total, 0),
    coalesce(a.wallet_outflows_total, 0),
    coalesce(a.wallet_transfer_in, 0),
    coalesce(a.wallet_transfer_out, 0),
    coalesce(a.wallet_challenge_rewards, 0),
    coalesce(a.wallet_refunds_in, 0),
    coalesce(a.wallet_payout_from_core, 0),
    coalesce(a.wallet_core_topups, 0),
    coalesce(a.external_inflows_total, 0),
    coalesce(a.external_outflows_total, 0),
    coalesce(a.external_deposit_count, 0),
    coalesce(a.external_withdrawal_count, 0),
    coalesce(a.core_growth_wallet_topups, 0) + coalesce(a.core_growth_challenge_rewards, 0) + coalesce(a.core_growth_reinvest, 0) + coalesce(a.core_growth_leader_bonus, 0) + coalesce(a.core_growth_other_system, 0),
    coalesce(a.core_growth_wallet_topups, 0),
    coalesce(a.core_growth_challenge_rewards, 0),
    coalesce(a.core_growth_reinvest, 0),
    coalesce(a.core_growth_leader_bonus, 0),
    coalesce(a.core_growth_other_system, 0),
    coalesce(a.core_accrual_gross, 0),
    b.core_balance_start,
    b.core_balance_end,
    public.calculate_core_level(b.core_balance_end),
    1,
    rebuild_at,
    false,
    rebuild_at
  from with_bounds b
  left join aggregated a
    on a.period_type = b.period_type
   and a.period_key = b.period_key;

  get diagnostics row_count = ROW_COUNT;

  return jsonb_build_object(
    'user_id', p_user_id,
    'rows', row_count,
    'rebuilt_at', rebuild_at,
    'from_date', p_from_date,
    'to_date', p_to_date
  );
end;
$$;

create or replace function public.reconcile_user_economy_metrics(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  metrics public.user_economy_metrics%rowtype;
  wallet public.wallet_accounts%rowtype;
  completed_purchases numeric(30, 12);
  completed_sales numeric(30, 12);
  source_core numeric(30, 12);
  core_balance numeric(30, 12);
  ok boolean;
  checked_at timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'User is required.' using errcode = '22023';
  end if;

  select * into metrics
  from public.user_economy_metrics
  where user_id = p_user_id and period_type = 'lifetime' and period_key = 'lifetime' and currency_code = 'OA$';

  if metrics.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'metrics_not_built');
  end if;

  select coalesce(sum(d.price_amount), 0)
  into completed_purchases
  from public.marketplace_deals d
  left join public.marketplace_escrows e on e.deal_id = d.id
  where d.buyer_user_id = p_user_id and d.status = 'completed' and coalesce(e.released_at, d.completed_at) is not null;

  select coalesce(sum(d.price_amount), 0)
  into completed_sales
  from public.marketplace_deals d
  left join public.marketplace_escrows e on e.deal_id = d.id
  where d.seller_user_id = p_user_id and d.status = 'completed' and coalesce(e.released_at, d.completed_at) is not null;

  select coalesce(sum(l.amount), 0)
  into source_core
  from (
    select l.amount from public.wallet_ledger l where l.user_id = p_user_id and l.operation_type = 'wallet_core_topup' and l.direction = 'debit'
    union all
    select c.reward_amount from public.user_challenges c where c.user_id = p_user_id and c.status = 'completed' and c.reward_account = 'core' and c.reward_amount is not null
    union all
    select a.core_amount from public.daily_core_accruals a where a.user_id = p_user_id
    union all
    select r.reward_amount from public.team_core_growth_rewards r where r.leader_user_id = p_user_id
  ) l;

  select balance into core_balance from public.core_accounts where user_id = p_user_id;
  select * into wallet from public.wallet_accounts where user_id = p_user_id;

  ok := abs(metrics.marketplace_purchases_gross - completed_purchases) < 0.000000000001
    and abs(metrics.marketplace_sales_gross - completed_sales) < 0.000000000001
    and (core_balance is null or abs(metrics.core_balance_end - core_balance) < 0.000000000001)
    and abs(metrics.core_growth_total - source_core) < 0.000000000001;

  update public.user_economy_metrics
  set is_reconciled = ok,
      last_reconciled_at = checked_at,
      updated_at = checked_at
  where user_id = p_user_id;

  return jsonb_build_object(
    'ok', ok,
    'checked_at', checked_at,
    'marketplace_purchases', metrics.marketplace_purchases_gross,
    'marketplace_purchases_source', completed_purchases,
    'marketplace_sales', metrics.marketplace_sales_gross,
    'marketplace_sales_source', completed_sales,
    'core_growth', metrics.core_growth_total,
    'core_growth_source', source_core,
    'core_balance_end', metrics.core_balance_end,
    'core_balance_live', core_balance,
    'wallet_balance_live', wallet.balance
  );
end;
$$;

revoke all on function public.rebuild_user_economy_metrics(uuid, date, date) from public, anon, authenticated;
revoke all on function public.reconcile_user_economy_metrics(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_user_economy_metrics(uuid, date, date) to service_role;
grant execute on function public.reconcile_user_economy_metrics(uuid) to service_role;

-- Initial deterministic backfill. Future runs can rebuild one user without touching source truth.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select id from auth.users loop
    perform public.rebuild_user_economy_metrics(v_user_id);
    perform public.reconcile_user_economy_metrics(v_user_id);
  end loop;
end;
$$;
