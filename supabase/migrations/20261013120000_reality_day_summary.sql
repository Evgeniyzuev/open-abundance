-- Reality day: one read-only summary of a user's UTC day for the daily reality post.
-- Turnover = every Wallet credit of the day (gross of any project fee) plus the Core payout to Wallet,
-- except returns of the user's own money (refunds, released collateral, compensation).
-- Spent = Wallet debits of the day except reserved P2P collateral.
-- Wins = challenges completed and wishes completed that day; private wish titles are not returned.
-- The function reads one user's indexed rows for one day and writes nothing.

alter table public.feed_post_stat_blocks
  drop constraint if exists feed_post_stat_blocks_block_key_check;

alter table public.feed_post_stat_blocks
  add constraint feed_post_stat_blocks_block_key_check
  check (
    block_key in (
      'core_growth',
      'wallet_income',
      'daily_rate',
      'reinvest',
      'level',
      'total_core_growth',
      'team_strength',
      'turnover',
      'spent',
      'wins'
    )
  );

create or replace function public.reality_day_summary(p_user_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (p_date::timestamp at time zone 'UTC') as day_start,
           ((p_date + 1)::timestamp at time zone 'UTC') as day_end
  ),
  ledger as (
    select
      l.direction,
      l.operation_type,
      l.counterparty_user_id,
      case
        when l.direction = 'credit' and coalesce(l.metadata ->> 'gross_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (l.metadata ->> 'gross_amount')::numeric
        else l.amount
      end as amount
    from public.wallet_ledger l, bounds b
    where l.user_id = p_user_id
      and l.currency_code = '$'
      and l.created_at >= b.day_start
      and l.created_at < b.day_end
  ),
  credits as (
    select * from ledger
    where direction = 'credit'
      and operation_type not in ('marketplace_refund', 'p2p_escrow_refund', 'p2p_collateral_release', 'p2p_compensation')
  ),
  debits as (
    select * from ledger
    where direction = 'debit'
      and operation_type <> 'p2p_collateral_hold'
  ),
  accrual as (
    select coalesce(sum(a.wallet_amount), 0) as wallet_amount
    from public.daily_core_accruals a
    where a.user_id = p_user_id and a.accrual_date = p_date
  ),
  turnover as (
    select
      coalesce(sum(amount) filter (where operation_type = 'marketplace_payment'), 0) as sales,
      coalesce(sum(amount) filter (where operation_type = 'wallet_transfer'), 0) as people,
      coalesce(sum(amount) filter (where operation_type in ('challenge_reward', 'team_bonus')), 0) as rewards,
      coalesce(sum(amount) filter (where operation_type in ('crypto_deposit', 'p2p_escrow_release')), 0) as deposits,
      coalesce(sum(amount) filter (where operation_type not in (
        'marketplace_payment', 'wallet_transfer', 'challenge_reward', 'team_bonus', 'crypto_deposit', 'p2p_escrow_release'
      )), 0) as other,
      count(distinct counterparty_user_id) filter (
        where operation_type in ('marketplace_payment', 'wallet_transfer') and counterparty_user_id is not null
      ) as unique_payers
    from credits
  ),
  spent as (
    select
      coalesce(sum(amount) filter (where operation_type = 'marketplace_escrow_hold'), 0) as purchases,
      coalesce(sum(amount) filter (where operation_type = 'wallet_transfer'), 0) as people,
      coalesce(sum(amount) filter (where operation_type in ('crypto_withdrawal', 'p2p_escrow_hold')), 0) as cash_out,
      coalesce(sum(amount) filter (where operation_type = 'wallet_core_topup'), 0) as core,
      coalesce(sum(amount) filter (where operation_type not in (
        'marketplace_escrow_hold', 'wallet_transfer', 'crypto_withdrawal', 'p2p_escrow_hold', 'wallet_core_topup'
      )), 0) as other
    from debits
  ),
  challenge_wins as (
    select coalesce(jsonb_agg(jsonb_build_object('id', s.challenge_id, 'title', s.challenge_title) order by s.completed_at), '[]'::jsonb) as items
    from public.challenge_completion_snapshots s, bounds b
    where s.user_id = p_user_id
      and s.completed_at >= b.day_start
      and s.completed_at < b.day_end
  ),
  wish_wins as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'title', case when w.visibility = 'public' then w.title else null end
    ) order by w.completed_at), '[]'::jsonb) as items
    from public.wishes w, bounds b
    where w.owner_user_id = p_user_id
      and w.deleted_at is null
      and w.status = 'completed'
      and w.completed_at >= b.day_start
      and w.completed_at < b.day_end
  )
  select jsonb_build_object(
    'date', p_date,
    'turnover', jsonb_build_object(
      'total', t.sales + t.people + t.rewards + t.deposits + t.other + a.wallet_amount,
      'sales', t.sales,
      'people', t.people,
      'rewards', t.rewards,
      'deposits', t.deposits,
      'core', a.wallet_amount,
      'other', t.other,
      'uniquePayers', t.unique_payers
    ),
    'spent', jsonb_build_object(
      'total', s.purchases + s.people + s.cash_out + s.core + s.other,
      'purchases', s.purchases,
      'people', s.people,
      'cashOut', s.cash_out,
      'core', s.core,
      'other', s.other
    ),
    'wins', jsonb_build_object(
      'challenges', cw.items,
      'wishes', ww.items
    )
  )
  from turnover t, spent s, accrual a, challenge_wins cw, wish_wins ww;
$$;

revoke all on function public.reality_day_summary(uuid, date) from public, anon, authenticated;
grant execute on function public.reality_day_summary(uuid, date) to service_role;
