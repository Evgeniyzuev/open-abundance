-- Counter-offers ("I buy yours, you buy mine"): a proposer offers one of their own active listings in exchange
-- for another seller's active listing. On acceptance both purchases are created in one transaction as two
-- ordinary Marketplace deals with their own escrow, and both sellers' acceptance is recorded because both sides
-- already agreed. If either purchase cannot be created (balance, listing taken), nothing is created.
-- Writes go through service-role RPCs; each side reads only its own offers.

create table if not exists public.marketplace_counter_offers (
  id uuid primary key default gen_random_uuid(),
  proposer_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  offered_listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  message text check (message is null or char_length(message) <= 280),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  proposer_deal_id uuid references public.marketplace_deals(id) on delete set null,
  target_deal_id uuid references public.marketplace_deals(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  constraint marketplace_counter_offers_not_self check (proposer_user_id <> target_user_id),
  constraint marketplace_counter_offers_distinct_listings check (target_listing_id <> offered_listing_id)
);

create unique index if not exists marketplace_counter_offers_one_pending_idx
  on public.marketplace_counter_offers (proposer_user_id, target_listing_id, offered_listing_id)
  where status = 'pending';
create index if not exists marketplace_counter_offers_target_idx
  on public.marketplace_counter_offers (target_user_id, status, created_at desc);
create index if not exists marketplace_counter_offers_proposer_idx
  on public.marketplace_counter_offers (proposer_user_id, status, created_at desc);

alter table public.marketplace_counter_offers enable row level security;
revoke all on table public.marketplace_counter_offers from anon, authenticated;
grant select on table public.marketplace_counter_offers to authenticated;
drop policy if exists marketplace_counter_offers_select_own on public.marketplace_counter_offers;
create policy marketplace_counter_offers_select_own on public.marketplace_counter_offers
  for select to authenticated
  using ((select auth.uid()) = proposer_user_id or (select auth.uid()) = target_user_id);

create or replace function public.create_marketplace_counter_offer(
  p_proposer_user_id uuid,
  p_target_listing_id uuid,
  p_offered_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.marketplace_listings%rowtype;
  v_offered public.marketplace_listings%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_existing public.marketplace_counter_offers%rowtype;
  v_offer public.marketplace_counter_offers%rowtype;
begin
  select * into v_target from public.marketplace_listings where id = p_target_listing_id;
  if not found or v_target.status <> 'active' then return jsonb_build_object('error', 'Listing is not active.'); end if;
  if v_target.seller_user_id = p_proposer_user_id then return jsonb_build_object('error', 'Choose another seller''s listing.'); end if;
  select * into v_offered from public.marketplace_listings where id = p_offered_listing_id;
  if not found or v_offered.status <> 'active' or v_offered.seller_user_id <> p_proposer_user_id then
    return jsonb_build_object('error', 'Offer one of your own active listings.');
  end if;
  select * into v_wallet from public.wallet_accounts where user_id = p_proposer_user_id;
  if not found or v_wallet.balance < v_target.price_amount then return jsonb_build_object('error', 'Insufficient wallet balance.'); end if;

  select * into v_existing from public.marketplace_counter_offers
    where proposer_user_id = p_proposer_user_id and target_listing_id = p_target_listing_id
      and offered_listing_id = p_offered_listing_id and status = 'pending';
  if found then return jsonb_build_object('offer_id', v_existing.id, 'status', 'pending', 'idempotent', true); end if;

  insert into public.marketplace_counter_offers (proposer_user_id, target_user_id, target_listing_id, offered_listing_id, message)
    values (p_proposer_user_id, v_target.seller_user_id, p_target_listing_id, p_offered_listing_id, nullif(btrim(p_message), ''))
    returning * into v_offer;

  perform public.create_notification_event(
    'market.counter_offer.created', 'deals', 'marketplace_counter_offer', v_offer.id::text,
    'Exchange offer', 'Someone offers to buy your item in exchange for theirs.',
    '/?view=wallet.market', array[v_offer.target_user_id], 'counter-offer:' || v_offer.id || ':created', '{}'::jsonb
  );
  return jsonb_build_object('offer_id', v_offer.id, 'status', 'pending', 'idempotent', false);
end;
$$;

create or replace function public.respond_marketplace_counter_offer(
  p_offer_id uuid,
  p_actor_user_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.marketplace_counter_offers%rowtype;
  v_proposer_deal jsonb;
  v_target_deal jsonb;
  v_accept jsonb;
  v_proposer_deal_id uuid;
  v_target_deal_id uuid;
  v_now timestamptz := now();
begin
  if p_action not in ('accept', 'decline', 'cancel') then return jsonb_build_object('error', 'Unknown action.'); end if;
  select * into v_offer from public.marketplace_counter_offers where id = p_offer_id for update;
  if not found then return jsonb_build_object('error', 'Offer not found.'); end if;
  if v_offer.status <> 'pending' then
    return jsonb_build_object('offer_id', v_offer.id, 'status', v_offer.status, 'idempotent', true);
  end if;
  if v_offer.expires_at <= v_now then
    update public.marketplace_counter_offers set status = 'expired', responded_at = v_now where id = v_offer.id;
    return jsonb_build_object('error', 'Offer has expired.');
  end if;

  if p_action = 'cancel' then
    if p_actor_user_id <> v_offer.proposer_user_id then return jsonb_build_object('error', 'Only the proposer can cancel.'); end if;
    update public.marketplace_counter_offers set status = 'cancelled', responded_at = v_now where id = v_offer.id;
    return jsonb_build_object('offer_id', v_offer.id, 'status', 'cancelled');
  end if;

  if p_actor_user_id <> v_offer.target_user_id then return jsonb_build_object('error', 'Only the recipient can respond.'); end if;

  if p_action = 'decline' then
    update public.marketplace_counter_offers set status = 'declined', responded_at = v_now where id = v_offer.id;
    perform public.create_notification_event(
      'market.counter_offer.declined', 'deals', 'marketplace_counter_offer', v_offer.id::text,
      'Exchange offer declined', 'Your exchange offer was declined.',
      '/?view=wallet.market', array[v_offer.proposer_user_id], 'counter-offer:' || v_offer.id || ':declined', '{}'::jsonb
    );
    return jsonb_build_object('offer_id', v_offer.id, 'status', 'declined');
  end if;

  -- Accept: both purchases or none.
  v_proposer_deal := public.create_marketplace_deal_with_key(v_offer.target_listing_id, v_offer.proposer_user_id, 'counter-offer:' || v_offer.id || ':proposer');
  if v_proposer_deal ? 'error' then raise exception 'Exchange failed: %', v_proposer_deal ->> 'error'; end if;
  v_target_deal := public.create_marketplace_deal_with_key(v_offer.offered_listing_id, v_offer.target_user_id, 'counter-offer:' || v_offer.id || ':target');
  if v_target_deal ? 'error' then raise exception 'Exchange failed: %', v_target_deal ->> 'error'; end if;
  v_proposer_deal_id := (v_proposer_deal ->> 'deal_id')::uuid;
  v_target_deal_id := (v_target_deal ->> 'deal_id')::uuid;

  -- Each seller already agreed to the exchange; record their acceptance for physical/service deals.
  if v_proposer_deal ->> 'status' = 'awaiting_seller' then
    v_accept := public.accept_marketplace_deal(v_proposer_deal_id, v_offer.target_user_id);
    if v_accept ? 'error' then raise exception 'Exchange failed: %', v_accept ->> 'error'; end if;
  end if;
  if v_target_deal ->> 'status' = 'awaiting_seller' then
    v_accept := public.accept_marketplace_deal(v_target_deal_id, v_offer.proposer_user_id);
    if v_accept ? 'error' then raise exception 'Exchange failed: %', v_accept ->> 'error'; end if;
  end if;

  update public.marketplace_counter_offers
    set status = 'accepted', responded_at = v_now, proposer_deal_id = v_proposer_deal_id, target_deal_id = v_target_deal_id
    where id = v_offer.id;
  -- Other pending offers that involve either listing can no longer be fulfilled.
  update public.marketplace_counter_offers
    set status = 'expired', responded_at = v_now
    where status = 'pending' and id <> v_offer.id
      and (target_listing_id in (v_offer.target_listing_id, v_offer.offered_listing_id)
        or offered_listing_id in (v_offer.target_listing_id, v_offer.offered_listing_id));
  perform public.create_notification_event(
    'market.counter_offer.accepted', 'deals', 'marketplace_counter_offer', v_offer.id::text,
    'Exchange accepted', 'Your exchange offer was accepted; both deals are open.',
    '/?view=wallet.market', array[v_offer.proposer_user_id], 'counter-offer:' || v_offer.id || ':accepted', '{}'::jsonb
  );
  return jsonb_build_object('offer_id', v_offer.id, 'status', 'accepted', 'proposer_deal_id', v_proposer_deal_id, 'target_deal_id', v_target_deal_id);
end;
$$;

revoke all on function public.create_marketplace_counter_offer(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_counter_offer(uuid, uuid, uuid, text) to service_role;
revoke all on function public.respond_marketplace_counter_offer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.respond_marketplace_counter_offer(uuid, uuid, text) to service_role;
