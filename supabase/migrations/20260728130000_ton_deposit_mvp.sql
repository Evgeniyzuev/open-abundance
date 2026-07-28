create table if not exists public.ton_deposit_config (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'TON' check (asset_code = 'TON'),
  deposit_address text not null,
  toncenter_api_url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ton_deposit_config_enabled_unique_idx
on public.ton_deposit_config (network, asset_code)
where enabled;

create table if not exists public.ton_deposit_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'TON' check (asset_code = 'TON'),
  invoice_code text not null unique,
  deposit_address text not null,
  expected_amount_nano numeric(39, 0) check (expected_amount_nano is null or expected_amount_nano > 0),
  status text not null default 'waiting' check (status in (
    'waiting',
    'detected',
    'finalizing',
    'credited',
    'credited_late',
    'credited_amount_mismatch',
    'unmatched',
    'awaiting_rate',
    'expired'
  )),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ton_deposit_invoices_user_created_idx
on public.ton_deposit_invoices (user_id, created_at desc);

create index if not exists ton_deposit_invoices_status_idx
on public.ton_deposit_invoices (status, created_at desc);

create table if not exists public.ton_chain_cursors (
  network text not null check (network in ('testnet', 'mainnet')),
  deposit_address text not null,
  last_logical_time numeric(30, 0) not null default 0,
  last_transaction_hash text,
  updated_at timestamptz not null default now(),
  primary key (network, deposit_address)
);

create table if not exists public.ton_chain_events (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'TON' check (asset_code = 'TON'),
  transaction_hash text not null,
  logical_time numeric(30, 0) not null,
  message_index integer not null default 0,
  sender_address text,
  receiver_address text not null,
  amount_nano numeric(39, 0) not null check (amount_nano > 0),
  comment text,
  invoice_code text,
  status text not null default 'detected' check (status in (
    'detected',
    'finalizing',
    'finalized',
    'credited',
    'credited_late',
    'credited_amount_mismatch',
    'unmatched',
    'awaiting_rate',
    'failed'
  )),
  finalized_at timestamptz,
  ton_usd_rate numeric(30, 12),
  rate_provider text,
  rate_source_timestamp timestamptz,
  settled_usd_amount numeric(30, 2) check (settled_usd_amount is null or settled_usd_amount > 0),
  settled_at timestamptz,
  settlement_user_id uuid references auth.users(id) on delete set null,
  settlement_ledger_id uuid references public.wallet_ledger(id) on delete set null,
  raw_transaction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, transaction_hash, logical_time, message_index)
);

create index if not exists ton_chain_events_status_idx
on public.ton_chain_events (network, status, logical_time desc);

create index if not exists ton_chain_events_sender_idx
on public.ton_chain_events (network, sender_address, created_at desc)
where sender_address is not null;

create table if not exists public.ton_price_quotes (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'TON' check (asset_code = 'TON'),
  usd_rate numeric(30, 12) not null check (usd_rate > 0),
  provider text not null,
  source_timestamp timestamptz,
  captured_at timestamptz not null default now()
);

create index if not exists ton_price_quotes_captured_idx
on public.ton_price_quotes (network, asset_code, captured_at desc);

create table if not exists public.ton_user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'TON' check (asset_code = 'TON'),
  normalized_address text not null,
  verification_status text not null default 'observed' check (verification_status in ('observed', 'verified', 'manual_review')),
  first_seen_at timestamptz not null default now(),
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (network, asset_code, normalized_address)
);

create index if not exists ton_user_wallets_user_idx
on public.ton_user_wallets (user_id, network, asset_code);

alter table public.ton_deposit_config enable row level security;
alter table public.ton_deposit_invoices enable row level security;
alter table public.ton_chain_cursors enable row level security;
alter table public.ton_chain_events enable row level security;
alter table public.ton_price_quotes enable row level security;
alter table public.ton_user_wallets enable row level security;

grant select on table public.ton_deposit_invoices to authenticated;
grant select on table public.ton_user_wallets to authenticated;
grant select, insert, update, delete on table public.ton_deposit_config to service_role;
grant select, insert, update, delete on table public.ton_deposit_invoices to service_role;
grant select, insert, update, delete on table public.ton_chain_cursors to service_role;
grant select, insert, update, delete on table public.ton_chain_events to service_role;
grant select, insert, update, delete on table public.ton_price_quotes to service_role;
grant select, insert, update, delete on table public.ton_user_wallets to service_role;

drop policy if exists "Users can read own TON invoices" on public.ton_deposit_invoices;
create policy "Users can read own TON invoices"
on public.ton_deposit_invoices
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own TON wallets" on public.ton_user_wallets;
create policy "Users can read own TON wallets"
on public.ton_user_wallets
for select
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists touch_ton_deposit_config_updated_at on public.ton_deposit_config;
create trigger touch_ton_deposit_config_updated_at
before update on public.ton_deposit_config
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_ton_deposit_invoices_updated_at on public.ton_deposit_invoices;
create trigger touch_ton_deposit_invoices_updated_at
before update on public.ton_deposit_invoices
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_ton_chain_events_updated_at on public.ton_chain_events;
create trigger touch_ton_chain_events_updated_at
before update on public.ton_chain_events
for each row
execute function public.touch_updated_at();

alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_operation_type_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_operation_type_check
  check (operation_type in (
    'marketplace_escrow_hold',
    'marketplace_payment',
    'marketplace_refund',
    'wallet_transfer',
    'wallet_core_topup',
    'challenge_reward',
    'crypto_deposit',
    'system_adjustment'
  ));

alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_source_type_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_source_type_check
  check (source_type in (
    'challenge',
    'core_topup',
    'marketplace_deal',
    'wallet_transfer',
    'crypto_deposit',
    'manual',
    'system'
  ));

create or replace function public.settle_ton_deposit(p_chain_event_id uuid)
returns table (
  event_status text,
  credited_user_id uuid,
  usd_amount numeric,
  wallet_balance numeric,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ton_chain_events%rowtype;
  v_invoice public.ton_deposit_invoices%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_usd_amount numeric(30, 2);
  v_status text;
  v_ledger_id uuid;
begin
  select *
  into v_event
  from public.ton_chain_events
  where id = p_chain_event_id
  for update;

  if not found then
    raise exception 'TON chain event not found.';
  end if;

  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'unmatched') then
    return query
    select v_event.status, v_event.settlement_user_id, coalesce(v_event.settled_usd_amount, 0)::numeric, null::numeric, v_event.settlement_ledger_id;
    return;
  end if;

  if v_event.status <> 'finalized' then
    raise exception 'TON chain event is not finalized.';
  end if;

  if v_event.invoice_code is null or btrim(v_event.invoice_code) = '' then
    update public.ton_chain_events
    set status = 'unmatched'
    where id = v_event.id;

    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_invoice
  from public.ton_deposit_invoices
  where invoice_code = v_event.invoice_code
  for update;

  if not found then
    update public.ton_chain_events
    set status = 'unmatched'
    where id = v_event.id;

    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_event.ton_usd_rate is null then
    update public.ton_chain_events
    set status = 'awaiting_rate'
    where id = v_event.id;

    update public.ton_deposit_invoices
    set status = 'awaiting_rate'
    where id = v_invoice.id;

    return query select 'awaiting_rate'::text, v_invoice.user_id, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_wallet
  from public.wallet_accounts
  where user_id = v_invoice.user_id
  for update;

  if not found then
    raise exception 'Wallet is not created yet.';
  end if;

  v_usd_amount := round(v_event.amount_nano / 1000000000 * v_event.ton_usd_rate, 2);
  if v_usd_amount <= 0 then
    raise exception 'TON deposit is below the minimum Wallet precision.';
  end if;

  v_status := case
    when v_invoice.expires_at < now() then 'credited_late'
    when v_invoice.expected_amount_nano is not null and v_invoice.expected_amount_nano <> v_event.amount_nano then 'credited_amount_mismatch'
    else 'credited'
  end;

  update public.wallet_accounts
  set balance = balance + v_usd_amount,
      updated_at = now()
  where user_id = v_invoice.user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (
    user_id,
    direction,
    amount,
    currency_code,
    operation_type,
    source_type,
    source_id,
    balance_after,
    idempotency_key,
    metadata
  ) values (
    v_invoice.user_id,
    'credit',
    v_usd_amount,
    v_wallet.currency_code,
    'crypto_deposit',
    'crypto_deposit',
    v_event.id,
    v_wallet.balance,
    'ton_deposit:' || v_event.id::text,
    jsonb_build_object(
      'network', v_event.network,
      'asset_code', v_event.asset_code,
      'transaction_hash', v_event.transaction_hash,
      'logical_time', v_event.logical_time,
      'amount_nano', v_event.amount_nano,
      'ton_usd_rate', v_event.ton_usd_rate,
      'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp,
      'quote_currency', 'USD',
      'credited_usd_amount', v_usd_amount,
      'wallet_currency_code', v_wallet.currency_code,
      'finalized_at', v_event.finalized_at,
      'invoice_code', v_event.invoice_code,
      'invoice_status', v_status
    )
  )
  returning id into v_ledger_id;

  update public.ton_chain_events
  set status = v_status,
      settled_usd_amount = v_usd_amount,
      settled_at = now(),
      settlement_user_id = v_invoice.user_id,
      settlement_ledger_id = v_ledger_id
  where id = v_event.id;

  update public.ton_deposit_invoices
  set status = v_status
  where id = v_invoice.id;

  return query select v_status, v_invoice.user_id, v_usd_amount, v_wallet.balance, v_ledger_id;
end;
$$;

revoke all on function public.settle_ton_deposit(uuid) from public;
grant execute on function public.settle_ton_deposit(uuid) to service_role;
