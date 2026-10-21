-- "Move my spending into Open Abundance": which kinds of regular spending a person is ready to move here.
--
-- No amounts, no products, no free text: only categories from a fixed list (lib/spendCategories.ts) and the
-- consent to receive favourable offers for them (founder decision 2026-10-21). Other people see only counts per
-- category, and only for categories chosen by at least 5 people. Rows are read and written only by the server
-- with the service role, filtered by the authenticated user id.

create table if not exists public.user_spend_intents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  categories text[] not null default '{}',
  offers_consent boolean not null default false,
  consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_spend_intents_categories_size check (cardinality(categories) <= 12)
);

create index if not exists user_spend_intents_consent_idx
  on public.user_spend_intents (offers_consent)
  where offers_consent;

alter table public.user_spend_intents enable row level security;
revoke all on public.user_spend_intents from public, anon, authenticated;
grant select, insert, update, delete on public.user_spend_intents to service_role;
