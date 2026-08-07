create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.user_artifacts(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text,
  price_amount numeric(30, 12) not null check (price_amount > 0),
  currency_code text not null default '$',
  status text not null default 'active' check (status in ('draft', 'active', 'reserved', 'sold', 'cancelled', 'expired')),
  terms_json jsonb not null default '{}'::jsonb,
  terms_hash text not null,
  expires_at timestamptz,
  cancelled_at timestamptz,
  sold_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (description is null or char_length(description) <= 1000),
  check (expires_at is null or expires_at > created_at)
);

create unique index if not exists marketplace_listings_open_artifact_unique_idx
on public.marketplace_listings (artifact_id)
where status in ('draft', 'active', 'reserved');

create index if not exists marketplace_listings_active_created_idx
on public.marketplace_listings (created_at desc)
where status = 'active';

create index if not exists marketplace_listings_seller_status_created_idx
on public.marketplace_listings (seller_user_id, status, created_at desc);

create index if not exists marketplace_listings_artifact_idx
on public.marketplace_listings (artifact_id);

alter table public.marketplace_listings enable row level security;

grant select on table public.marketplace_listings to authenticated;
grant select, insert, update, delete on table public.marketplace_listings to service_role;

drop policy if exists "Users can read active and own marketplace listings" on public.marketplace_listings;
create policy "Users can read active and own marketplace listings"
on public.marketplace_listings
for select
to authenticated
using (
  status = 'active'
  or (select auth.uid()) = seller_user_id
);

drop trigger if exists touch_marketplace_listings_updated_at on public.marketplace_listings;
create trigger touch_marketplace_listings_updated_at
before update on public.marketplace_listings
for each row
execute function public.touch_updated_at();
