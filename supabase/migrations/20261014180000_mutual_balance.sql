-- Mutual balance (founder decision 2026-10-14, docs/GROWTH_REALITY_PLAN.md section 3.8):
-- Marketplace purchases minus Marketplace sales over every completed deal (escrow released to the seller),
-- for a rolling window and for all time. Transfers are not deals and do not count. Read-only, one user's rows
-- through the existing buyer/seller status indexes; it does not change ranking yet.

create or replace function public.mutual_balance(p_user_id uuid, p_window_days integer default 90)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with deals as (
    select
      case when d.buyer_user_id = p_user_id then d.price_amount else 0 end as purchase,
      case when d.seller_user_id = p_user_id then d.price_amount else 0 end as sale,
      e.released_at >= now() - make_interval(days => greatest(1, least(coalesce(p_window_days, 90), 3650))) as in_window
    from public.marketplace_deals d
    join public.marketplace_escrows e on e.deal_id = d.id
    where (d.buyer_user_id = p_user_id or d.seller_user_id = p_user_id)
      and d.status = 'completed'
      and e.status = 'released'
      and e.released_at is not null
      and d.currency_code = '$'
  )
  select jsonb_build_object(
    'windowDays', greatest(1, least(coalesce(p_window_days, 90), 3650)),
    'window', jsonb_build_object(
      'purchases', coalesce(sum(purchase) filter (where in_window), 0),
      'sales', coalesce(sum(sale) filter (where in_window), 0),
      'balance', coalesce(sum(purchase - sale) filter (where in_window), 0),
      'purchaseCount', count(*) filter (where in_window and purchase > 0),
      'saleCount', count(*) filter (where in_window and sale > 0)
    ),
    'lifetime', jsonb_build_object(
      'purchases', coalesce(sum(purchase), 0),
      'sales', coalesce(sum(sale), 0),
      'balance', coalesce(sum(purchase - sale), 0),
      'purchaseCount', count(*) filter (where purchase > 0),
      'saleCount', count(*) filter (where sale > 0)
    )
  )
  from deals;
$$;

revoke all on function public.mutual_balance(uuid, integer) from public, anon, authenticated;
grant execute on function public.mutual_balance(uuid, integer) to service_role;
