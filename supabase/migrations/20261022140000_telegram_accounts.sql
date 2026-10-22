-- Which Open Abundance account a Telegram account signs in to (Telegram Mini App entry).
--
-- One Telegram id points to one account. A row is written on the first Mini App sign-in (a new
-- account made from Telegram) or when a person links Telegram to the account they already have
-- (Google or email) with a one-time link from their profile. Read and written only by the server
-- with the service role.

create table if not exists public.telegram_accounts (
  telegram_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_username text,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_accounts_user_idx on public.telegram_accounts (user_id);

alter table public.telegram_accounts enable row level security;
revoke all on public.telegram_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_accounts to service_role;
