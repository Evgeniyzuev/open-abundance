-- "Присматриваю": things a person considers buying, added by an external link.
--
-- A product is deliberately NOT a row of public.wishes: challenges, the public profile, the feed and
-- coordinator metrics count wishes as goals. A product has a link, a price and its own status, and is
-- the base for later recommendations and aggregated (opt-in) demand. Writes go through the server only.

create table if not exists public.wish_products (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  wish_id uuid references public.wishes(id) on delete set null,
  source_url text not null,
  canonical_url text,
  title text not null,
  description text not null default '',
  image_url text,
  price_amount numeric(18, 2),
  price_currency text not null default 'USD',
  status text not null default 'considering',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wish_products_title_not_blank check (length(btrim(title)) > 0),
  constraint wish_products_price_non_negative check (price_amount is null or price_amount >= 0),
  constraint wish_products_currency_not_blank check (length(btrim(price_currency)) > 0),
  constraint wish_products_status_check check (status in ('considering', 'bought', 'dropped')),
  constraint wish_products_owner_url_unique unique (owner_user_id, source_url)
);

create index if not exists wish_products_owner_created_idx
  on public.wish_products (owner_user_id, created_at desc);

create index if not exists wish_products_wish_idx
  on public.wish_products (wish_id)
  where wish_id is not null;

alter table public.wish_products enable row level security;

drop policy if exists "wish_products_owner_select" on public.wish_products;
create policy "wish_products_owner_select"
  on public.wish_products
  for select
  to authenticated
  using (owner_user_id = auth.uid());

revoke all on public.wish_products from public, anon, authenticated;
grant select on public.wish_products to authenticated;
grant select, insert, update, delete on public.wish_products to service_role;
