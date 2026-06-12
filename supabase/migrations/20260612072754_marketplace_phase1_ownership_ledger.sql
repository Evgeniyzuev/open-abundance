create table if not exists public.user_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null,
  title text not null,
  description text,
  image_url text,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'system')),
  visibility text not null default 'private' check (visibility in ('private', 'public', 'team')),
  transferable boolean not null default false,
  locked_by_deal_id uuid,
  source_type text not null default 'manual' check (
    source_type in (
      'challenge',
      'wish',
      'feed_post',
      'marketplace_deal',
      'team_contact',
      'manual',
      'system'
    )
  ),
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.wallet_accounts(user_id) on delete cascade,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(30, 12) not null check (amount > 0),
  currency_code text not null default 'OA$',
  operation_type text not null check (
    operation_type in (
      'marketplace_escrow_hold',
      'marketplace_payment',
      'marketplace_refund',
      'wallet_transfer',
      'wallet_core_topup',
      'challenge_reward',
      'system_adjustment'
    )
  ),
  source_type text not null default 'manual' check (
    source_type in (
      'challenge',
      'core_topup',
      'marketplace_deal',
      'wallet_transfer',
      'manual',
      'system'
    )
  ),
  source_id uuid,
  counterparty_user_id uuid references auth.users(id) on delete set null,
  balance_after numeric(30, 12) not null check (balance_after >= 0),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (counterparty_user_id is null or counterparty_user_id <> user_id)
);

create index if not exists user_artifacts_user_created_idx
on public.user_artifacts (user_id, created_at desc);

create index if not exists user_artifacts_public_visibility_idx
on public.user_artifacts (visibility, created_at desc)
where visibility = 'public';

create index if not exists user_artifacts_type_idx
on public.user_artifacts (artifact_type, created_at desc);

create index if not exists user_artifacts_locked_deal_idx
on public.user_artifacts (locked_by_deal_id)
where locked_by_deal_id is not null;

create index if not exists user_artifacts_source_idx
on public.user_artifacts (source_type, source_id)
where source_id is not null;

create index if not exists wallet_ledger_user_created_idx
on public.wallet_ledger (user_id, created_at desc);

create index if not exists wallet_ledger_operation_idx
on public.wallet_ledger (operation_type, created_at desc);

create index if not exists wallet_ledger_source_idx
on public.wallet_ledger (source_type, source_id)
where source_id is not null;

create unique index if not exists wallet_ledger_idempotency_key_unique_idx
on public.wallet_ledger (idempotency_key)
where idempotency_key is not null;

create unique index if not exists wallet_ledger_source_user_operation_unique_idx
on public.wallet_ledger (operation_type, source_type, source_id, user_id, direction)
where source_id is not null;

alter table public.user_artifacts enable row level security;
alter table public.wallet_ledger enable row level security;

grant select on table public.user_artifacts to authenticated;
grant select on table public.wallet_ledger to authenticated;

grant select, insert, update, delete on table public.user_artifacts to service_role;
grant select, insert, update, delete on table public.wallet_ledger to service_role;

drop policy if exists "Users can read own and public artifacts" on public.user_artifacts;
create policy "Users can read own and public artifacts"
on public.user_artifacts
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or visibility = 'public'
);

drop policy if exists "Users can read own wallet ledger" on public.wallet_ledger;
create policy "Users can read own wallet ledger"
on public.wallet_ledger
for select
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists touch_user_artifacts_updated_at on public.user_artifacts;
create trigger touch_user_artifacts_updated_at
before update on public.user_artifacts
for each row
execute function public.touch_updated_at();
