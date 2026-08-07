-- Marketplace Phase 3-4: Deals, Escrow and Atomic Completion

-- ============================================================
-- Phase 3: Deals
-- ============================================================

create table if not exists public.marketplace_deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.user_artifacts(id) on delete restrict,
  price_amount numeric(30, 12) not null check (price_amount > 0),
  currency_code text not null default '$',
  terms_json jsonb not null default '{}'::jsonb,
  terms_hash text not null,
  status text not null default 'proposed' check (status in (
    'proposed', 'awaiting_seller', 'awaiting_buyer', 'accepted',
    'completed', 'cancelled', 'expired', 'refunded', 'disputed'
  )),
  buyer_accepted_terms_hash text,
  seller_accepted_terms_hash text,
  buyer_accepted_at timestamptz,
  seller_accepted_at timestamptz,
  escrow_held_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_user_id <> seller_user_id)
);
create unique index if not exists marketplace_deals_open_listing_unique_idx
  on public.marketplace_deals (listing_id)
  where status not in ('completed', 'cancelled', 'expired', 'refunded');
create index if not exists marketplace_deals_buyer_status_idx
  on public.marketplace_deals (buyer_user_id, status);
create index if not exists marketplace_deals_seller_status_idx
  on public.marketplace_deals (seller_user_id, status);
create table if not exists public.marketplace_deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.marketplace_deals(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'buyer_accepted', 'seller_accepted', 'escrow_held',
    'completed', 'cancelled', 'expired', 'refunded', 'disputed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_deal_events_deal_id_idx
  on public.marketplace_deal_events (deal_id, created_at);
-- ============================================================
-- RLS
-- ============================================================

alter table public.marketplace_deals enable row level security;
alter table public.marketplace_deal_events enable row level security;
-- Users can read deals they are part of
create policy "Users can read own marketplace deals"
  on public.marketplace_deals
  for select
  to authenticated
  using (
    seller_user_id = auth.uid() or buyer_user_id = auth.uid()
  );
-- Users can read events for deals they are part of
create policy "Users can read own deal events"
  on public.marketplace_deal_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.marketplace_deals
      where id = deal_id
      and (seller_user_id = auth.uid() or buyer_user_id = auth.uid())
    )
  );
revoke all on table public.marketplace_deals from public, anon, authenticated;
revoke all on table public.marketplace_deal_events from public, anon, authenticated;
grant select on table public.marketplace_deals to authenticated;
grant select on table public.marketplace_deal_events to authenticated;
grant select, insert, update, delete on table public.marketplace_deals to service_role;
grant select, insert, update, delete on table public.marketplace_deal_events to service_role;
-- ============================================================
-- Phase 4: Atomic Completion RPC
-- ============================================================

create or replace function public.complete_marketplace_deal(
  p_deal_id uuid,
  p_actor_user_id uuid
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_deal public.marketplace_deals%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_artifact public.user_artifacts%rowtype;
  v_buyer_wallet public.wallet_accounts%rowtype;
  v_seller_wallet public.wallet_accounts%rowtype;
  v_next_buyer_balance numeric(30, 12);
  v_next_seller_balance numeric(30, 12);
  v_now timestamptz := now();
  v_escrow_ledger_id uuid;
  v_payment_ledger_id uuid;
begin
  -- Lock and load deal
  select * into v_deal
  from public.marketplace_deals
  where id = p_deal_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Deal not found.');
  end if;

  -- Check actor is buyer or seller
  if p_actor_user_id not in (v_deal.buyer_user_id, v_deal.seller_user_id) then
    return jsonb_build_object('error', 'Only buyer or seller can complete this deal.');
  end if;

  -- Check deal is in accepted state (both sides accepted)
  if v_deal.status != 'accepted' then
    return jsonb_build_object('error', 'Deal must be in accepted state. Current status: ' || v_deal.status);
  end if;

  -- Check both sides accepted the same terms
  if v_deal.buyer_accepted_terms_hash is null or v_deal.seller_accepted_terms_hash is null then
    return jsonb_build_object('error', 'Both sides must accept the terms first.');
  end if;

  if v_deal.buyer_accepted_terms_hash != v_deal.seller_accepted_terms_hash then
    return jsonb_build_object('error', 'Both sides must accept the same terms version.');
  end if;

  -- Lock listing
  select * into v_listing
  from public.marketplace_listings
  where id = v_deal.listing_id
  for update;

  -- Lock artifact
  select * into v_artifact
  from public.user_artifacts
  where id = v_deal.artifact_id
  for update;

  if v_artifact.locked_by_deal_id != v_deal.id then
    return jsonb_build_object('error', 'Artifact is not locked by this deal.');
  end if;

  -- Lock wallets
  select * into v_buyer_wallet
  from public.wallet_accounts
  where user_id = v_deal.buyer_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Buyer wallet not found.');
  end if;

  select * into v_seller_wallet
  from public.wallet_accounts
  where user_id = v_deal.seller_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Seller wallet not found.');
  end if;

  -- Calculate balances
  v_next_buyer_balance := v_buyer_wallet.balance - v_deal.price_amount;
  v_next_seller_balance := v_seller_wallet.balance + v_deal.price_amount;

  if v_next_buyer_balance < 0 then
    return jsonb_build_object('error', 'Buyer has insufficient wallet balance.');
  end if;

  -- Update wallets
  update public.wallet_accounts
  set balance = v_next_buyer_balance, updated_at = v_now
  where user_id = v_deal.buyer_user_id;

  update public.wallet_accounts
  set balance = v_next_seller_balance, updated_at = v_now
  where user_id = v_deal.seller_user_id;

  -- Write buyer debit ledger
  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type,
    source_type, source_id, counterparty_user_id, balance_after, metadata
  ) values (
    v_deal.buyer_user_id, 'debit', v_deal.price_amount, v_deal.currency_code,
    'marketplace_payment', 'marketplace_deal', v_deal.id,
    v_deal.seller_user_id, v_next_buyer_balance,
    jsonb_build_object('deal_id', v_deal.id, 'listing_id', v_deal.listing_id)
  ) returning id into v_payment_ledger_id;

  -- Write seller credit ledger
  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type,
    source_type, source_id, counterparty_user_id, balance_after, metadata
  ) values (
    v_deal.seller_user_id, 'credit', v_deal.price_amount, v_deal.currency_code,
    'marketplace_payment', 'marketplace_deal', v_deal.id,
    v_deal.buyer_user_id, v_next_seller_balance,
    jsonb_build_object('deal_id', v_deal.id, 'listing_id', v_deal.listing_id)
  );

  -- Transfer artifact ownership
  update public.user_artifacts
  set user_id = v_deal.buyer_user_id,
      locked_by_deal_id = null,
      updated_at = v_now
  where id = v_deal.artifact_id;

  -- Update listing to sold
  update public.marketplace_listings
  set status = 'sold', sold_at = v_now, updated_at = v_now
  where id = v_deal.listing_id;

  -- Update deal to completed
  update public.marketplace_deals
  set status = 'completed', completed_at = v_now, updated_at = v_now
  where id = v_deal.id;

  -- Write deal event
  insert into public.marketplace_deal_events (deal_id, actor_user_id, event_type, metadata)
  values (p_deal_id, p_actor_user_id, 'completed', jsonb_build_object('payment_ledger_id', v_payment_ledger_id));

  return jsonb_build_object(
    'deal_id', v_deal.id,
    'status', 'completed',
    'buyer_balance_after', v_next_buyer_balance,
    'seller_balance_after', v_next_seller_balance,
    'artifact_transferred', true
  );
end;
$$;
-- ============================================================
-- Create deal RPC (buyer proposes)
-- ============================================================

create or replace function public.create_marketplace_deal(
  p_listing_id uuid,
  p_buyer_user_id uuid
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_deal_id uuid;
  v_now timestamptz := now();
begin
  -- Lock and load listing
  select * into v_listing
  from public.marketplace_listings
  where id = p_listing_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Listing not found.');
  end if;

  if v_listing.status != 'active' then
    return jsonb_build_object('error', 'Listing is not active.');
  end if;

  if v_listing.seller_user_id = p_buyer_user_id then
    return jsonb_build_object('error', 'Cannot buy your own item.');
  end if;

  -- Check no open deal exists for this listing
  if exists (
    select 1 from public.marketplace_deals
    where listing_id = p_listing_id
    and status not in ('completed', 'cancelled', 'expired', 'refunded')
  ) then
    return jsonb_build_object('error', 'A deal is already open for this listing.');
  end if;

  -- Lock artifact
  perform 1 from public.user_artifacts
  where id = v_listing.artifact_id
  for update;

  -- Mark listing as reserved
  update public.marketplace_listings
  set status = 'reserved', updated_at = v_now
  where id = p_listing_id;

  -- Lock artifact to this deal
  update public.user_artifacts
  set locked_by_deal_id = gen_random_uuid()
  where id = v_listing.artifact_id;

  -- Create deal
  insert into public.marketplace_deals (
    listing_id, seller_user_id, buyer_user_id, artifact_id,
    price_amount, currency_code, terms_json, terms_hash,
    status, buyer_accepted_terms_hash, buyer_accepted_at,
    expires_at, created_at, updated_at
  ) values (
    p_listing_id, v_listing.seller_user_id, p_buyer_user_id,
    v_listing.artifact_id, v_listing.price_amount, v_listing.currency_code,
    v_listing.terms_json, v_listing.terms_hash,
    'awaiting_seller', v_listing.terms_hash, v_now,
    v_now + interval '7 days', v_now, v_now
  ) returning id into v_deal_id;

  -- Update artifact with real deal id
  update public.user_artifacts
  set locked_by_deal_id = v_deal_id
  where id = v_listing.artifact_id;

  -- Write event
  insert into public.marketplace_deal_events (deal_id, actor_user_id, event_type, metadata)
  values (v_deal_id, p_buyer_user_id, 'created', jsonb_build_object('listing_id', p_listing_id));
  insert into public.marketplace_deal_events (deal_id, actor_user_id, event_type, metadata)
  values (v_deal_id, p_buyer_user_id, 'buyer_accepted', jsonb_build_object('terms_hash', v_listing.terms_hash));

  return jsonb_build_object(
    'deal_id', v_deal_id,
    'status', 'awaiting_seller',
    'listing_id', p_listing_id
  );
end;
$$;
-- ============================================================
-- Accept deal RPC (seller accepts)
-- ============================================================

create or replace function public.accept_marketplace_deal(
  p_deal_id uuid,
  p_actor_user_id uuid
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_deal public.marketplace_deals%rowtype;
  v_now timestamptz := now();
begin
  select * into v_deal
  from public.marketplace_deals
  where id = p_deal_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Deal not found.');
  end if;

  if p_actor_user_id not in (v_deal.seller_user_id, v_deal.buyer_user_id) then
    return jsonb_build_object('error', 'Only buyer or seller can accept this deal.');
  end if;

  -- Seller accepting
  if p_actor_user_id = v_deal.seller_user_id then
    if v_deal.status != 'awaiting_seller' then
      return jsonb_build_object('error', 'Deal is not awaiting seller acceptance.');
    end if;

    update public.marketplace_deals
    set status = 'accepted',
        seller_accepted_terms_hash = v_deal.terms_hash,
        seller_accepted_at = v_now,
        updated_at = v_now
    where id = p_deal_id;

    insert into public.marketplace_deal_events (deal_id, actor_user_id, event_type, metadata)
    values (p_deal_id, p_actor_user_id, 'seller_accepted', jsonb_build_object('terms_hash', v_deal.terms_hash));

    return jsonb_build_object('deal_id', p_deal_id, 'status', 'accepted', 'message', 'Deal accepted by seller. Ready to complete.');
  end if;

  -- Buyer accepting (re-accept after terms change)
  if p_actor_user_id = v_deal.buyer_user_id then
    if v_deal.status not in ('proposed', 'awaiting_buyer') then
      return jsonb_build_object('error', 'Deal is not awaiting buyer acceptance.');
    end if;

    update public.marketplace_deals
    set status = 'awaiting_seller',
        buyer_accepted_terms_hash = v_deal.terms_hash,
        buyer_accepted_at = v_now,
        updated_at = v_now
    where id = p_deal_id;

    insert into public.marketplace_deal_events (deal_id, actor_user_id, event_type, metadata)
    values (p_deal_id, p_actor_user_id, 'buyer_accepted', jsonb_build_object('terms_hash', v_deal.terms_hash));

    return jsonb_build_object('deal_id', p_deal_id, 'status', 'awaiting_seller', 'message', 'Terms accepted by buyer. Waiting for seller.');
  end if;
end;
$$;
-- ============================================================
-- Cancel deal RPC
-- ============================================================

create or replace function public.cancel_marketplace_deal(
  p_deal_id uuid,
  p_actor_user_id uuid
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_deal public.marketplace_deals%rowtype;
  v_now timestamptz := now();
begin
  select * into v_deal
  from public.marketplace_deals
  where id = p_deal_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Deal not found.');
  end if;

  if p_actor_user_id not in (v_deal.seller_user_id, v_deal.buyer_user_id) then
    return jsonb_build_object('error', 'Only buyer or seller can cancel this deal.');
  end if;

  if v_deal.status in ('completed', 'refunded') then
    return jsonb_build_object('error', 'Cannot cancel a completed or refunded deal.');
  end if;

  -- Release artifact lock
  update public.user_artifacts
  set locked_by_deal_id = null, updated_at = v_now
  where id = v_deal.artifact_id and locked_by_deal_id = p_deal_id;

  -- Return listing to active
  update public.marketplace_listings
  set status = 'active', updated_at = v_now
  where id = v_deal.listing_id and status = 'reserved';

  -- Update deal
  update public.marketplace_deals
  set status = 'cancelled', cancelled_at = v_now, updated_at = v_now
  where id = p_deal_id;

  insert into public.marketplace_deal_events (deal_id, actor_user_id, event_type, metadata)
  values (p_deal_id, p_actor_user_id, 'cancelled', jsonb_build_object('previous_status', v_deal.status));

  return jsonb_build_object('deal_id', p_deal_id, 'status', 'cancelled');
end;
$$;
-- ============================================================
-- Grant execute to service_role only
-- ============================================================

revoke all on function public.complete_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_marketplace_deal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.create_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.accept_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.cancel_marketplace_deal(uuid, uuid) to service_role;
-- Add marketplace_payment to wallet_ledger operation_type check constraint
-- First drop the existing check, then add updated one
alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_operation_type_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_operation_type_check
  check (
    operation_type in (
      'marketplace_escrow_hold',
      'marketplace_payment',
      'marketplace_refund',
      'wallet_transfer',
      'wallet_core_topup',
      'challenge_reward',
      'system_adjustment'
    )
  );
-- Add marketplace_deal to wallet_ledger source_type check
alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_source_type_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_source_type_check
  check (
    source_type in (
      'challenge',
      'core_topup',
      'marketplace_deal',
      'wallet_transfer',
      'manual',
      'system'
    )
  );
-- Add sales_count and rating columns to marketplace_listings (for Phase 6)
alter table public.marketplace_listings
  add column if not exists sales_count integer not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists rating_sum integer not null default 0,
  add column if not exists review_count integer not null default 0;
-- Trigger to update updated_at
drop trigger if exists touch_marketplace_deals_updated_at on public.marketplace_deals;
create trigger touch_marketplace_deals_updated_at
  before update on public.marketplace_deals
  for each row
  execute function public.touch_updated_at();
