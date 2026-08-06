-- Internal Marketplace: zero-fee Wallet escrow, delivery settlement and reviews.
-- Blockchain settlement is intentionally out of scope for this migration.

alter table public.marketplace_listings
  alter column artifact_id drop not null;

alter table public.marketplace_deals
  alter column artifact_id drop not null;

alter table public.marketplace_listings
  add column if not exists listing_kind text not null default 'digital_asset',
  add column if not exists image_url text,
  add column if not exists category text,
  add column if not exists fulfillment_days integer,
  add column if not exists terms_version integer not null default 1;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_listing_kind_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_listing_kind_check
  check (listing_kind in ('digital_asset', 'service', 'physical_good'));

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_artifact_kind_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_artifact_kind_check
  check ((listing_kind = 'digital_asset' and artifact_id is not null) or listing_kind in ('service', 'physical_good'));

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_fulfillment_days_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_fulfillment_days_check
  check (fulfillment_days is null or fulfillment_days in (1, 3, 7, 14));

drop index if exists public.marketplace_listings_open_artifact_unique_idx;
create unique index if not exists marketplace_listings_open_artifact_unique_idx
  on public.marketplace_listings (artifact_id)
  where artifact_id is not null and status in ('draft', 'active', 'reserved');

create or replace function public.prevent_marketplace_terms_change_after_reserve()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status in ('reserved', 'sold', 'cancelled', 'expired')
    and (new.terms_hash is distinct from old.terms_hash or new.terms_version is distinct from old.terms_version) then
    raise exception 'Listing terms are immutable after reservation.';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_listing_terms_immutable on public.marketplace_listings;
create trigger marketplace_listing_terms_immutable
  before update on public.marketplace_listings
  for each row execute function public.prevent_marketplace_terms_change_after_reserve();

alter table public.marketplace_deals
  add column if not exists idempotency_key text,
  add column if not exists delivery_due_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists buyer_confirmed_at timestamptz,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_reason text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution text;

alter table public.marketplace_deals
  drop constraint if exists marketplace_deals_status_check;
alter table public.marketplace_deals
  add constraint marketplace_deals_status_check
  check (status in ('proposed', 'awaiting_seller', 'awaiting_buyer', 'accepted', 'delivered', 'completed', 'cancelled', 'expired', 'refunded', 'disputed'));

create unique index if not exists marketplace_deals_buyer_idempotency_idx
  on public.marketplace_deals (buyer_user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.marketplace_deal_events
  alter column actor_user_id drop not null;
alter table public.marketplace_deal_events
  add column if not exists actor_type text not null default 'user';

alter table public.marketplace_deal_events
  drop constraint if exists marketplace_deal_events_event_type_check;
alter table public.marketplace_deal_events
  add constraint marketplace_deal_events_event_type_check
  check (event_type in ('created', 'buyer_accepted', 'seller_accepted', 'escrow_held', 'delivered', 'buyer_confirmed', 'completed', 'cancelled', 'expired', 'refunded', 'disputed', 'resolution'));

create table if not exists public.marketplace_escrows (
  deal_id uuid primary key references public.marketplace_deals(id) on delete cascade,
  status text not null default 'held' check (status in ('held', 'released', 'refunded')),
  hold_idempotency_key text not null unique,
  release_idempotency_key text unique,
  refund_idempotency_key text unique,
  held_at timestamptz not null default now(),
  released_at timestamptz,
  refunded_at timestamptz
);

create index if not exists marketplace_escrows_status_idx
  on public.marketplace_escrows (status, held_at);

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.marketplace_deals(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text check (review_text is null or char_length(review_text) <= 1000),
  status text not null default 'published' check (status in ('published', 'hidden', 'flagged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_escrows enable row level security;
alter table public.marketplace_reviews enable row level security;

grant select on table public.marketplace_escrows to authenticated;
grant select, insert, update, delete on table public.marketplace_escrows to service_role;
grant select on table public.marketplace_reviews to authenticated;
grant select, insert, update, delete on table public.marketplace_reviews to service_role;

drop policy if exists "Users can read own marketplace escrows" on public.marketplace_escrows;
create policy "Users can read own marketplace escrows"
  on public.marketplace_escrows for select to authenticated
  using (exists (
    select 1
    from public.marketplace_deals d
    where d.id = deal_id
      and (select auth.uid()) in (d.buyer_user_id, d.seller_user_id)
  ));

drop policy if exists "Users can read marketplace reviews" on public.marketplace_reviews;
create policy "Users can read marketplace reviews"
  on public.marketplace_reviews for select to authenticated
  using (status = 'published' or (select auth.uid()) in (buyer_user_id, seller_user_id));

create or replace function public.marketplace_release_escrow(
  p_deal_id uuid,
  p_actor_user_id uuid,
  p_event_type text default 'completed'
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_deal public.marketplace_deals%rowtype;
  v_escrow public.marketplace_escrows%rowtype;
  v_seller_wallet public.wallet_accounts%rowtype;
  v_next_seller_balance numeric(30, 12);
  v_now timestamptz := now();
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  select * into v_escrow from public.marketplace_escrows where deal_id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal escrow not found.'); end if;
  if v_escrow.status = 'released' then
    return jsonb_build_object('deal_id', p_deal_id, 'status', 'completed', 'idempotent', true);
  end if;
  if v_escrow.status <> 'held' then return jsonb_build_object('error', 'Escrow is not held.'); end if;
  if v_deal.status not in ('delivered', 'accepted', 'completed', 'disputed') then
    return jsonb_build_object('error', 'Deal is not releasable.');
  end if;

  select * into v_seller_wallet from public.wallet_accounts where user_id = v_deal.seller_user_id for update;
  if not found then return jsonb_build_object('error', 'Seller wallet not found.'); end if;
  v_next_seller_balance := v_seller_wallet.balance + v_deal.price_amount;
  update public.wallet_accounts set balance = v_next_seller_balance, updated_at = v_now where user_id = v_deal.seller_user_id;
  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    counterparty_user_id, balance_after, idempotency_key, metadata
  ) values (
    v_deal.seller_user_id, 'credit', v_deal.price_amount, v_deal.currency_code, 'marketplace_payment',
    'marketplace_deal', v_deal.id, v_deal.buyer_user_id, v_next_seller_balance,
    'marketplace:' || v_deal.id::text || ':release:seller', jsonb_build_object('deal_id', v_deal.id)
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  update public.marketplace_escrows
    set status = 'released', release_idempotency_key = 'marketplace:' || v_deal.id::text || ':release:seller', released_at = v_now
    where deal_id = v_deal.id;
  update public.marketplace_deals
    set status = 'completed', completed_at = coalesce(completed_at, v_now), resolved_at = case when p_event_type = 'completed' then null else v_now end, resolution = case when p_event_type = 'completed' then null else 'release_to_seller' end, updated_at = v_now
    where id = v_deal.id;
  update public.marketplace_listings set status = 'sold', sales_count = sales_count + 1, sold_at = coalesce(sold_at, v_now), updated_at = v_now where id = v_deal.listing_id;
  update public.user_artifacts set user_id = v_deal.buyer_user_id, locked_by_deal_id = null, updated_at = v_now where id = v_deal.artifact_id and v_deal.artifact_id is not null;
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata)
    values (v_deal.id, p_actor_user_id, case when p_actor_user_id is null then 'system' else 'user' end, p_event_type, jsonb_build_object('amount', v_deal.price_amount));
  if p_event_type <> 'completed' then
    insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata)
      values (v_deal.id, p_actor_user_id, case when p_actor_user_id is null then 'system' else 'user' end, 'completed', jsonb_build_object('amount', v_deal.price_amount));
  end if;
  return jsonb_build_object('deal_id', v_deal.id, 'status', 'completed', 'idempotent', false);
end;
$$;

create or replace function public.marketplace_refund_escrow(
  p_deal_id uuid,
  p_actor_user_id uuid,
  p_event_type text default 'refunded',
  p_final_status text default 'refunded'
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_deal public.marketplace_deals%rowtype;
  v_escrow public.marketplace_escrows%rowtype;
  v_buyer_wallet public.wallet_accounts%rowtype;
  v_next_buyer_balance numeric(30, 12);
  v_now timestamptz := now();
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  select * into v_escrow from public.marketplace_escrows where deal_id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal escrow not found.'); end if;
  if v_escrow.status = 'refunded' then return jsonb_build_object('deal_id', p_deal_id, 'status', p_final_status, 'idempotent', true); end if;
  if v_escrow.status <> 'held' then return jsonb_build_object('error', 'Escrow is not held.'); end if;
  select * into v_buyer_wallet from public.wallet_accounts where user_id = v_deal.buyer_user_id for update;
  if not found then return jsonb_build_object('error', 'Buyer wallet not found.'); end if;
  v_next_buyer_balance := v_buyer_wallet.balance + v_deal.price_amount;
  update public.wallet_accounts set balance = v_next_buyer_balance, updated_at = v_now where user_id = v_deal.buyer_user_id;
  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    counterparty_user_id, balance_after, idempotency_key, metadata
  ) values (
    v_deal.buyer_user_id, 'credit', v_deal.price_amount, v_deal.currency_code, 'marketplace_refund',
    'marketplace_deal', v_deal.id, v_deal.seller_user_id, v_next_buyer_balance,
    'marketplace:' || v_deal.id::text || ':refund:buyer', jsonb_build_object('deal_id', v_deal.id)
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  update public.marketplace_escrows
    set status = 'refunded', refund_idempotency_key = 'marketplace:' || v_deal.id::text || ':refund:buyer', refunded_at = v_now
    where deal_id = v_deal.id;
  update public.marketplace_deals set status = p_final_status, cancelled_at = case when p_final_status = 'cancelled' then v_now else cancelled_at end, resolved_at = case when p_final_status = 'refunded' then v_now else resolved_at end, resolution = case when p_final_status = 'refunded' then 'refund_buyer' else resolution end, updated_at = v_now where id = v_deal.id;
  update public.marketplace_listings set status = 'active', updated_at = v_now where id = v_deal.listing_id and status = 'reserved';
  update public.user_artifacts set locked_by_deal_id = null, updated_at = v_now where id = v_deal.artifact_id and v_deal.artifact_id is not null and locked_by_deal_id = v_deal.id;
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata)
    values (v_deal.id, p_actor_user_id, case when p_actor_user_id is null then 'system' else 'user' end, p_event_type, jsonb_build_object('amount', v_deal.price_amount));
  return jsonb_build_object('deal_id', v_deal.id, 'status', p_final_status, 'idempotent', false);
end;
$$;

create or replace function public.create_marketplace_deal_with_key(
  p_listing_id uuid,
  p_buyer_user_id uuid,
  p_idempotency_key text
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_artifact public.user_artifacts%rowtype;
  v_buyer_wallet public.wallet_accounts%rowtype;
  v_seller_wallet public.wallet_accounts%rowtype;
  v_deal_id uuid;
  v_now timestamptz := now();
  v_next_buyer_balance numeric(30, 12);
  v_next_seller_balance numeric(30, 12);
  v_delivery_due timestamptz;
  v_existing public.marketplace_deals%rowtype;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required.'; end if;
  select * into v_existing from public.marketplace_deals where buyer_user_id = p_buyer_user_id and idempotency_key = trim(p_idempotency_key) limit 1;
  if found then return jsonb_build_object('deal_id', v_existing.id, 'status', v_existing.status, 'idempotent', true); end if;
  select * into v_listing from public.marketplace_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('error', 'Listing not found.'); end if;
  select * into v_existing
    from public.marketplace_deals
    where buyer_user_id = p_buyer_user_id and idempotency_key = trim(p_idempotency_key)
    limit 1;
  if found then return jsonb_build_object('deal_id', v_existing.id, 'status', v_existing.status, 'idempotent', true); end if;
  if v_listing.status <> 'active' then return jsonb_build_object('error', 'Listing is not active.'); end if;
  if v_listing.seller_user_id = p_buyer_user_id then return jsonb_build_object('error', 'Cannot buy your own item.'); end if;
  if exists (select 1 from public.marketplace_deals where listing_id = p_listing_id and status not in ('completed', 'cancelled', 'expired', 'refunded')) then return jsonb_build_object('error', 'A deal is already open for this listing.'); end if;
  if v_listing.artifact_id is not null then
    select * into v_artifact from public.user_artifacts where id = v_listing.artifact_id for update;
    if not found or v_artifact.user_id <> v_listing.seller_user_id or not v_artifact.transferable or v_artifact.locked_by_deal_id is not null then return jsonb_build_object('error', 'The listed item is not transferable.'); end if;
  end if;
  perform 1
  from public.wallet_accounts
  where user_id in (p_buyer_user_id, v_listing.seller_user_id)
  order by user_id
  for update;
  select * into v_buyer_wallet from public.wallet_accounts where user_id = p_buyer_user_id for update;
  if not found then return jsonb_build_object('error', 'Buyer wallet not found.'); end if;
  if v_buyer_wallet.balance < v_listing.price_amount then return jsonb_build_object('error', 'Buyer has insufficient wallet balance.'); end if;
  v_next_buyer_balance := v_buyer_wallet.balance - v_listing.price_amount;
  insert into public.marketplace_deals (
    listing_id, seller_user_id, buyer_user_id, artifact_id, price_amount, currency_code,
    terms_json, terms_hash, status, buyer_accepted_terms_hash, buyer_accepted_at, escrow_held_at,
    expires_at, delivery_due_at, idempotency_key, created_at, updated_at
  ) values (
    p_listing_id, v_listing.seller_user_id, p_buyer_user_id, v_listing.artifact_id,
    v_listing.price_amount, v_listing.currency_code, v_listing.terms_json, v_listing.terms_hash,
    case when v_listing.listing_kind = 'digital_asset' then 'completed' else 'awaiting_seller' end,
    v_listing.terms_hash, v_now, v_now,
    v_now + interval '24 hours',
    case when v_listing.listing_kind = 'digital_asset' then null else v_now + (coalesce(v_listing.fulfillment_days, 7) || ' days')::interval end,
    trim(p_idempotency_key), v_now, v_now
  ) on conflict (buyer_user_id, idempotency_key) where idempotency_key is not null do nothing returning id into v_deal_id;
  if v_deal_id is null then
    select * into v_existing
      from public.marketplace_deals
      where buyer_user_id = p_buyer_user_id and idempotency_key = trim(p_idempotency_key)
      limit 1;
    if found then return jsonb_build_object('deal_id', v_existing.id, 'status', v_existing.status, 'idempotent', true); end if;
    return jsonb_build_object('error', 'Deal idempotency conflict.');
  end if;
  if v_listing.listing_kind = 'digital_asset' then
    update public.marketplace_deals set completed_at = v_now where id = v_deal_id;
  end if;
  update public.marketplace_listings set status = case when v_listing.listing_kind = 'digital_asset' then 'sold' else 'reserved' end, sales_count = case when v_listing.listing_kind = 'digital_asset' then sales_count + 1 else sales_count end, sold_at = case when v_listing.listing_kind = 'digital_asset' then v_now else null end, updated_at = v_now where id = p_listing_id;
  if v_listing.artifact_id is not null then update public.user_artifacts set locked_by_deal_id = v_deal_id, updated_at = v_now where id = v_listing.artifact_id; end if;
  update public.wallet_accounts set balance = v_next_buyer_balance, updated_at = v_now where user_id = p_buyer_user_id;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
    values (p_buyer_user_id, 'debit', v_listing.price_amount, v_listing.currency_code, 'marketplace_escrow_hold', 'marketplace_deal', v_deal_id, v_listing.seller_user_id, v_next_buyer_balance, 'marketplace:' || v_deal_id::text || ':hold:buyer', jsonb_build_object('deal_id', v_deal_id));
  insert into public.marketplace_escrows (deal_id, hold_idempotency_key)
    values (v_deal_id, 'marketplace:' || v_deal_id::text || ':hold:buyer');
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (v_deal_id, p_buyer_user_id, 'user', 'created', jsonb_build_object('listing_id', p_listing_id));
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (v_deal_id, p_buyer_user_id, 'user', 'buyer_accepted', jsonb_build_object('terms_hash', v_listing.terms_hash));
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (v_deal_id, p_buyer_user_id, 'user', 'escrow_held', jsonb_build_object('amount', v_listing.price_amount));
  if v_listing.listing_kind = 'digital_asset' then
    select * into v_seller_wallet from public.wallet_accounts where user_id = v_listing.seller_user_id for update;
    if not found then raise exception 'Seller wallet not found.'; end if;
    v_next_seller_balance := v_seller_wallet.balance + v_listing.price_amount;
    update public.wallet_accounts set balance = v_next_seller_balance, updated_at = v_now where user_id = v_listing.seller_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
      values (v_listing.seller_user_id, 'credit', v_listing.price_amount, v_listing.currency_code, 'marketplace_payment', 'marketplace_deal', v_deal_id, p_buyer_user_id, v_next_seller_balance, 'marketplace:' || v_deal_id::text || ':release:seller', jsonb_build_object('deal_id', v_deal_id));
    update public.marketplace_escrows set status = 'released', release_idempotency_key = 'marketplace:' || v_deal_id::text || ':release:seller', released_at = v_now where deal_id = v_deal_id;
    update public.user_artifacts set user_id = p_buyer_user_id, locked_by_deal_id = null, updated_at = v_now where id = v_listing.artifact_id;
    insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (v_deal_id, p_buyer_user_id, 'user', 'completed', jsonb_build_object('amount', v_listing.price_amount));
  end if;
  return jsonb_build_object('deal_id', v_deal_id, 'status', case when v_listing.listing_kind = 'digital_asset' then 'completed' else 'awaiting_seller' end, 'idempotent', false);
end;
$$;

create or replace function public.create_marketplace_deal(p_listing_id uuid, p_buyer_user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select public.create_marketplace_deal_with_key(p_listing_id, p_buyer_user_id, gen_random_uuid()::text);
$$;

create or replace function public.accept_marketplace_deal(p_deal_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deal public.marketplace_deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  if p_actor_user_id <> v_deal.seller_user_id then return jsonb_build_object('error', 'Only the seller can accept this deal.'); end if;
  if v_deal.status <> 'awaiting_seller' then return jsonb_build_object('error', 'Deal is not awaiting seller acceptance.'); end if;
  if v_deal.expires_at is not null and v_deal.expires_at <= v_now then return jsonb_build_object('error', 'Seller acceptance window has expired.'); end if;
  update public.marketplace_deals set status = 'accepted', seller_accepted_terms_hash = terms_hash, seller_accepted_at = v_now, delivery_due_at = v_now + (coalesce((select fulfillment_days from public.marketplace_listings where id = v_deal.listing_id), 7) || ' days')::interval, updated_at = v_now where id = p_deal_id;
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (p_deal_id, p_actor_user_id, 'user', 'seller_accepted', jsonb_build_object('terms_hash', v_deal.terms_hash));
  return jsonb_build_object('deal_id', p_deal_id, 'status', 'accepted');
end;
$$;

create or replace function public.deliver_marketplace_deal(p_deal_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deal public.marketplace_deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  if p_actor_user_id <> v_deal.seller_user_id then return jsonb_build_object('error', 'Only the seller can mark delivery.'); end if;
  if v_deal.status <> 'accepted' then return jsonb_build_object('error', 'Deal is not ready for delivery.'); end if;
  update public.marketplace_deals set status = 'delivered', delivered_at = v_now, updated_at = v_now where id = p_deal_id;
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (p_deal_id, p_actor_user_id, 'user', 'delivered', '{}'::jsonb);
  return jsonb_build_object('deal_id', p_deal_id, 'status', 'delivered');
end;
$$;

create or replace function public.confirm_marketplace_deal(p_deal_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deal public.marketplace_deals%rowtype; v_result jsonb;
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  if p_actor_user_id <> v_deal.buyer_user_id then return jsonb_build_object('error', 'Only the buyer can confirm delivery.'); end if;
  if v_deal.status <> 'delivered' then return jsonb_build_object('error', 'Deal is not delivered.'); end if;
  update public.marketplace_deals
    set buyer_confirmed_at = coalesce(buyer_confirmed_at, now()), updated_at = now()
    where id = p_deal_id;
  v_result := public.marketplace_release_escrow(p_deal_id, p_actor_user_id, 'buyer_confirmed');
  if (v_result ? 'error') then return v_result; end if;
  return v_result;
end;
$$;

create or replace function public.complete_marketplace_deal(p_deal_id uuid, p_actor_user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select public.confirm_marketplace_deal(p_deal_id, p_actor_user_id);
$$;

create or replace function public.cancel_marketplace_deal(p_deal_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deal public.marketplace_deals%rowtype; v_result jsonb;
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  if p_actor_user_id not in (v_deal.buyer_user_id, v_deal.seller_user_id) then return jsonb_build_object('error', 'Only a deal participant can cancel.'); end if;
  if v_deal.status not in ('awaiting_seller', 'proposed') then return jsonb_build_object('error', 'Deal can no longer be cancelled.'); end if;
  v_result := public.marketplace_refund_escrow(p_deal_id, p_actor_user_id, 'cancelled', 'cancelled');
  return v_result;
end;
$$;

create or replace function public.dispute_marketplace_deal(p_deal_id uuid, p_actor_user_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deal public.marketplace_deals%rowtype; v_now timestamptz := now();
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id for update;
  if not found then return jsonb_build_object('error', 'Deal not found.'); end if;
  if p_actor_user_id not in (v_deal.buyer_user_id, v_deal.seller_user_id) then return jsonb_build_object('error', 'Only a deal participant can dispute.'); end if;
  if v_deal.status not in ('accepted', 'delivered') then return jsonb_build_object('error', 'Deal cannot be disputed in its current state.'); end if;
  update public.marketplace_deals set status = 'disputed', disputed_at = v_now, dispute_reason = left(nullif(trim(p_reason), ''), 1000), updated_at = v_now where id = p_deal_id;
  insert into public.marketplace_deal_events (deal_id, actor_user_id, actor_type, event_type, metadata) values (p_deal_id, p_actor_user_id, 'user', 'disputed', jsonb_build_object('reason', left(nullif(trim(p_reason), ''), 1000)));
  return jsonb_build_object('deal_id', p_deal_id, 'status', 'disputed');
end;
$$;

create or replace function public.resolve_marketplace_dispute(p_deal_id uuid, p_resolution text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.marketplace_deals where id = p_deal_id;
  if v_status is null then return jsonb_build_object('error', 'Deal not found.'); end if;
  if v_status <> 'disputed' then return jsonb_build_object('error', 'Deal is not disputed.'); end if;
  if p_resolution = 'release_to_seller' then return public.marketplace_release_escrow(p_deal_id, null, 'resolution'); end if;
  if p_resolution = 'refund_buyer' then return public.marketplace_refund_escrow(p_deal_id, null, 'resolution', 'refunded'); end if;
  return jsonb_build_object('error', 'Resolution must be release_to_seller or refund_buyer.');
end;
$$;

create or replace function public.process_marketplace_deal_timers(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deal record; v_count integer := 0; v_result jsonb;
begin
  for v_deal in
    select id from public.marketplace_deals
    where (status = 'awaiting_seller' and expires_at <= now())
       or (status = 'delivered' and delivered_at <= now() - interval '72 hours')
    order by expires_at nulls last, created_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  loop
    if exists (select 1 from public.marketplace_deals where id = v_deal.id and status = 'awaiting_seller') then
      v_result := public.marketplace_refund_escrow(v_deal.id, null, 'expired', 'expired');
    else
      v_result := public.marketplace_release_escrow(v_deal.id, null, 'completed');
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.create_marketplace_review(
  p_deal_id uuid,
  p_buyer_user_id uuid,
  p_rating integer,
  p_review_text text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_deal public.marketplace_deals%rowtype; v_listing public.marketplace_listings%rowtype;
begin
  select * into v_deal from public.marketplace_deals where id = p_deal_id;
  if not found or v_deal.buyer_user_id <> p_buyer_user_id or v_deal.status <> 'completed' then return jsonb_build_object('error', 'Only the buyer can review a completed deal.'); end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then return jsonb_build_object('error', 'Rating must be between 1 and 5.'); end if;
  if exists (select 1 from public.marketplace_reviews where deal_id = p_deal_id) then return jsonb_build_object('error', 'A review already exists for this deal.'); end if;
  select * into v_listing from public.marketplace_listings where id = v_deal.listing_id;
  insert into public.marketplace_reviews (deal_id, listing_id, seller_user_id, buyer_user_id, rating, review_text) values (p_deal_id, v_deal.listing_id, v_deal.seller_user_id, p_buyer_user_id, p_rating, left(nullif(trim(p_review_text), ''), 1000));
  update public.marketplace_listings set rating_count = rating_count + 1, rating_sum = rating_sum + p_rating, review_count = review_count + 1 where id = v_listing.id;
  return jsonb_build_object('deal_id', p_deal_id, 'status', 'published');
end;
$$;

revoke all on function public.marketplace_release_escrow(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.marketplace_refund_escrow(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_marketplace_deal_with_key(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.deliver_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_marketplace_deal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dispute_marketplace_deal(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_marketplace_dispute(uuid, text) from public, anon, authenticated;
revoke all on function public.process_marketplace_deal_timers(integer) from public, anon, authenticated;
revoke all on function public.create_marketplace_review(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.marketplace_release_escrow(uuid, uuid, text) to service_role;
grant execute on function public.marketplace_refund_escrow(uuid, uuid, text, text) to service_role;
grant execute on function public.create_marketplace_deal_with_key(uuid, uuid, text) to service_role;
grant execute on function public.create_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.accept_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.deliver_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.confirm_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.complete_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.cancel_marketplace_deal(uuid, uuid) to service_role;
grant execute on function public.dispute_marketplace_deal(uuid, uuid, text) to service_role;
grant execute on function public.resolve_marketplace_dispute(uuid, text) to service_role;
grant execute on function public.process_marketplace_deal_timers(integer) to service_role;
grant execute on function public.create_marketplace_review(uuid, uuid, integer, text) to service_role;

drop trigger if exists touch_marketplace_reviews_updated_at on public.marketplace_reviews;
create trigger touch_marketplace_reviews_updated_at before update on public.marketplace_reviews for each row execute function public.touch_updated_at();
