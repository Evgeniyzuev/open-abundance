create table if not exists public.ton_withdrawals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'TON' check (asset_code = 'TON'),
  destination_address text not null,
  normalized_destination_address text not null,
  amount_nano numeric(39, 0) not null check (amount_nano > 0),
  amount_ton numeric(30, 9) not null check (amount_ton > 0),
  ton_usd_rate numeric(30, 12) not null check (ton_usd_rate > 0),
  rate_provider text not null,
  rate_source_timestamp timestamptz,
  payout_wallet_amount numeric(30, 12) not null check (payout_wallet_amount > 0),
  service_fee_percent numeric(10, 4) not null check (service_fee_percent >= 0),
  service_fee_amount numeric(30, 12) not null check (service_fee_amount >= 0),
  network_fee_estimate_ton numeric(30, 9) not null check (network_fee_estimate_ton > 0),
  network_fee_reserve_ton numeric(30, 9) not null check (network_fee_reserve_ton > 0),
  network_fee_reserve_amount numeric(30, 12) not null check (network_fee_reserve_amount > 0),
  total_reserved_amount numeric(30, 12) not null check (total_reserved_amount > 0),
  status text not null default 'funds_reserved' check (status in (
    'funds_reserved',
    'broadcasting',
    'broadcast',
    'confirmed',
    'manual_review',
    'failed',
    'refunded'
  )),
  idempotency_key text not null,
  source_address text,
  seqno bigint,
  message_hash text,
  transaction_hash text,
  error_code text,
  error_message text,
  refunded_at timestamptz,
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists ton_withdrawals_user_created_idx
on public.ton_withdrawals (user_id, created_at desc);

create index if not exists ton_withdrawals_status_idx
on public.ton_withdrawals (status, created_at desc);

alter table public.ton_withdrawals enable row level security;

grant select on table public.ton_withdrawals to authenticated;
grant select, insert, update, delete on table public.ton_withdrawals to service_role;

drop policy if exists "Users can read own TON withdrawals" on public.ton_withdrawals;
create policy "Users can read own TON withdrawals"
on public.ton_withdrawals
for select
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists touch_ton_withdrawals_updated_at on public.ton_withdrawals;
create trigger touch_ton_withdrawals_updated_at
before update on public.ton_withdrawals
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
    'crypto_withdrawal',
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
    'crypto_withdrawal',
    'manual',
    'system'
  ));

create or replace function public.reserve_ton_withdrawal(
  p_withdrawal_id uuid,
  p_user_id uuid,
  p_network text,
  p_destination_address text,
  p_normalized_destination_address text,
  p_amount_nano numeric,
  p_amount_ton numeric,
  p_ton_usd_rate numeric,
  p_rate_provider text,
  p_rate_source_timestamp timestamptz,
  p_payout_wallet_amount numeric,
  p_service_fee_percent numeric,
  p_service_fee_amount numeric,
  p_network_fee_estimate_ton numeric,
  p_network_fee_reserve_ton numeric,
  p_network_fee_reserve_amount numeric,
  p_total_reserved_amount numeric,
  p_idempotency_key text
)
returns table (
  withdrawal_id uuid,
  withdrawal_status text,
  total_reserved_amount numeric,
  wallet_balance numeric,
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_withdrawal public.ton_withdrawals%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  next_wallet_balance numeric(30, 12);
  ledger_id uuid;
begin
  select *
  into existing_withdrawal
  from public.ton_withdrawals
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    select balance into next_wallet_balance
    from public.wallet_accounts
    where user_id = p_user_id;
    return query select existing_withdrawal.id, existing_withdrawal.status, existing_withdrawal.total_reserved_amount, next_wallet_balance, false;
    return;
  end if;

  if p_withdrawal_id is null or p_user_id is null or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Missing TON withdrawal idempotency data.';
  end if;
  if p_total_reserved_amount is null or p_total_reserved_amount <= 0 then
    raise exception 'TON withdrawal reserve must be greater than 0.';
  end if;

  select *
  into locked_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Wallet is not created yet.';
  end if;
  if locked_wallet.balance < p_total_reserved_amount then
    raise exception 'Insufficient wallet balance for withdrawal and fees.';
  end if;

  next_wallet_balance := locked_wallet.balance - p_total_reserved_amount;

  insert into public.ton_withdrawals (
    id,
    user_id,
    network,
    destination_address,
    normalized_destination_address,
    amount_nano,
    amount_ton,
    ton_usd_rate,
    rate_provider,
    rate_source_timestamp,
    payout_wallet_amount,
    service_fee_percent,
    service_fee_amount,
    network_fee_estimate_ton,
    network_fee_reserve_ton,
    network_fee_reserve_amount,
    total_reserved_amount,
    idempotency_key
  ) values (
    p_withdrawal_id,
    p_user_id,
    p_network,
    p_destination_address,
    p_normalized_destination_address,
    p_amount_nano,
    p_amount_ton,
    p_ton_usd_rate,
    p_rate_provider,
    p_rate_source_timestamp,
    p_payout_wallet_amount,
    p_service_fee_percent,
    p_service_fee_amount,
    p_network_fee_estimate_ton,
    p_network_fee_reserve_ton,
    p_network_fee_reserve_amount,
    p_total_reserved_amount,
    p_idempotency_key
  );

  update public.wallet_accounts
  set balance = next_wallet_balance,
      updated_at = now()
  where user_id = p_user_id;

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
    p_user_id,
    'debit',
    p_total_reserved_amount,
    locked_wallet.currency_code,
    'crypto_withdrawal',
    'crypto_withdrawal',
    p_withdrawal_id,
    next_wallet_balance,
    'ton_withdrawal:' || p_withdrawal_id::text || ':reserve',
    jsonb_build_object(
      'network', p_network,
      'asset_code', 'TON',
      'amount_ton', p_amount_ton,
      'amount_nano', p_amount_nano,
      'payout_wallet_amount', p_payout_wallet_amount,
      'service_fee_percent', p_service_fee_percent,
      'service_fee_amount', p_service_fee_amount,
      'network_fee_estimate_ton', p_network_fee_estimate_ton,
      'network_fee_reserve_ton', p_network_fee_reserve_ton,
      'network_fee_reserve_amount', p_network_fee_reserve_amount,
      'ton_usd_rate', p_ton_usd_rate,
      'rate_provider', p_rate_provider,
      'rate_source_timestamp', p_rate_source_timestamp,
      'destination_address', p_normalized_destination_address,
      'withdrawal_status', 'funds_reserved'
    )
  ) returning id into ledger_id;

  return query select p_withdrawal_id, 'funds_reserved'::text, p_total_reserved_amount, next_wallet_balance, true;
end;
$$;

create or replace function public.begin_ton_withdrawal_broadcast(p_withdrawal_id uuid)
returns table (claimed boolean, withdrawal_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  update public.ton_withdrawals
  set status = 'broadcasting'
  where id = p_withdrawal_id
    and status = 'funds_reserved'
  returning true, status into claimed, withdrawal_status;

  if claimed is not null then
    return query select claimed, withdrawal_status;
    return;
  end if;

  select status into current_status from public.ton_withdrawals where id = p_withdrawal_id;
  return query select false, current_status;
end;
$$;

create or replace function public.complete_ton_withdrawal_broadcast(
  p_withdrawal_id uuid,
  p_source_address text,
  p_seqno bigint,
  p_message_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ton_withdrawals
  set status = 'broadcast',
      source_address = p_source_address,
      seqno = p_seqno,
      message_hash = p_message_hash,
      broadcast_at = now(),
      error_code = null,
      error_message = null
  where id = p_withdrawal_id
    and status = 'broadcasting';

  update public.wallet_ledger
  set metadata = metadata || jsonb_build_object(
    'withdrawal_status', 'broadcast',
    'source_address', p_source_address,
    'seqno', p_seqno,
    'message_hash', p_message_hash
  )
  where source_id = p_withdrawal_id
    and operation_type = 'crypto_withdrawal'
    and direction = 'debit';
end;
$$;

create or replace function public.refund_ton_withdrawal(
  p_withdrawal_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_withdrawal public.ton_withdrawals%rowtype;
  locked_wallet public.wallet_accounts%rowtype;
  next_wallet_balance numeric(30, 12);
begin
  select * into locked_withdrawal
  from public.ton_withdrawals
  where id = p_withdrawal_id
  for update;

  if not found or locked_withdrawal.status not in ('funds_reserved', 'broadcasting') then
    return;
  end if;

  select * into locked_wallet
  from public.wallet_accounts
  where user_id = locked_withdrawal.user_id
  for update;

  if not found then
    raise exception 'Wallet is not created yet.';
  end if;

  next_wallet_balance := locked_wallet.balance + locked_withdrawal.total_reserved_amount;
  update public.wallet_accounts
  set balance = next_wallet_balance,
      updated_at = now()
  where user_id = locked_withdrawal.user_id;

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
    locked_withdrawal.user_id,
    'credit',
    locked_withdrawal.total_reserved_amount,
    locked_wallet.currency_code,
    'crypto_withdrawal',
    'crypto_withdrawal',
    locked_withdrawal.id,
    next_wallet_balance,
    'ton_withdrawal:' || locked_withdrawal.id::text || ':refund',
    jsonb_build_object(
      'withdrawal_status', 'refunded',
      'error_code', p_error_code,
      'error_message', p_error_message
    )
  );

  update public.ton_withdrawals
  set status = 'refunded',
      error_code = p_error_code,
      error_message = p_error_message,
      refunded_at = now()
  where id = locked_withdrawal.id;
end;
$$;

create or replace function public.mark_ton_withdrawal_manual_review(
  p_withdrawal_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ton_withdrawals
  set status = 'manual_review',
      error_code = p_error_code,
      error_message = p_error_message
  where id = p_withdrawal_id
    and status = 'broadcasting';
end;
$$;

revoke all on function public.reserve_ton_withdrawal(uuid, uuid, text, text, text, numeric, numeric, numeric, text, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public;
revoke all on function public.begin_ton_withdrawal_broadcast(uuid) from public;
revoke all on function public.complete_ton_withdrawal_broadcast(uuid, text, bigint, text) from public;
revoke all on function public.refund_ton_withdrawal(uuid, text, text) from public;
revoke all on function public.mark_ton_withdrawal_manual_review(uuid, text, text) from public;
grant execute on function public.reserve_ton_withdrawal(uuid, uuid, text, text, text, numeric, numeric, numeric, text, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to service_role;
grant execute on function public.begin_ton_withdrawal_broadcast(uuid) to service_role;
grant execute on function public.complete_ton_withdrawal_broadcast(uuid, text, bigint, text) to service_role;
grant execute on function public.refund_ton_withdrawal(uuid, text, text) to service_role;
grant execute on function public.mark_ton_withdrawal_manual_review(uuid, text, text) to service_role;
