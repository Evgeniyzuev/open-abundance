create table if not exists public.ton_usdt_config (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'USDT' check (asset_code = 'USDT'),
  master_address text not null,
  deposit_owner_address text not null,
  deposit_jetton_wallet_address text not null,
  toncenter_api_url text not null,
  decimals integer not null default 6 check (decimals = 6),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ton_usdt_config_enabled_unique_idx
on public.ton_usdt_config (network, asset_code, master_address)
where enabled;

create table if not exists public.ton_usdt_deposit_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'USDT' check (asset_code = 'USDT'),
  master_address text not null,
  invoice_code text not null unique,
  deposit_owner_address text not null,
  deposit_jetton_wallet_address text not null,
  expected_amount_units numeric(39, 0) check (expected_amount_units is null or expected_amount_units > 0),
  status text not null default 'waiting' check (status in (
    'waiting', 'detected', 'finalizing', 'confirmed_pending_credit',
    'credited', 'credited_late', 'credited_amount_mismatch',
    'unmatched', 'awaiting_rate', 'cancelled', 'expired'
  )),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ton_usdt_active_invoice_user_idx
on public.ton_usdt_deposit_invoices (user_id)
where status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate');
create index if not exists ton_usdt_deposit_invoices_user_created_idx
on public.ton_usdt_deposit_invoices (user_id, created_at desc);
create index if not exists ton_usdt_deposit_invoices_status_idx
on public.ton_usdt_deposit_invoices (status, created_at desc);

create table if not exists public.ton_usdt_chain_cursors (
  network text not null check (network in ('testnet', 'mainnet')),
  master_address text not null,
  deposit_jetton_wallet_address text not null,
  last_logical_time numeric(30, 0) not null default 0,
  last_transaction_hash text,
  updated_at timestamptz not null default now(),
  primary key (network, master_address, deposit_jetton_wallet_address)
);

create table if not exists public.ton_usdt_chain_events (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'USDT' check (asset_code = 'USDT'),
  master_address text not null,
  transaction_hash text not null,
  logical_time numeric(30, 0) not null,
  message_index integer not null default 0,
  source_jetton_wallet_address text not null,
  receiver_jetton_wallet_address text not null,
  sender_owner_address text,
  amount_units numeric(39, 0) not null check (amount_units > 0),
  comment text,
  invoice_code text,
  status text not null default 'detected' check (status in (
    'detected', 'finalizing', 'finalized', 'credited', 'credited_late',
    'credited_amount_mismatch', 'unmatched', 'awaiting_rate', 'failed'
  )),
  rejection_reason text,
  finalized_at timestamptz,
  usdt_usd_rate numeric(30, 12),
  rate_provider text,
  rate_source_timestamp timestamptz,
  rate_metadata jsonb not null default '{}'::jsonb,
  settled_usd_amount numeric(30, 2) check (settled_usd_amount is null or settled_usd_amount > 0),
  settled_at timestamptz,
  settlement_user_id uuid references auth.users(id) on delete set null,
  settlement_ledger_id uuid references public.wallet_ledger(id) on delete set null,
  raw_transaction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, master_address, transaction_hash, logical_time, message_index)
);

create index if not exists ton_usdt_chain_events_status_idx
on public.ton_usdt_chain_events (network, master_address, status, logical_time desc);
create index if not exists ton_usdt_chain_events_sender_idx
on public.ton_usdt_chain_events (network, sender_owner_address, created_at desc)
where sender_owner_address is not null;

create table if not exists public.ton_usdt_price_quotes (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'USDT' check (asset_code = 'USDT'),
  usd_rate numeric(30, 12) not null check (usd_rate > 0),
  provider text not null,
  source_timestamp timestamptz,
  captured_at timestamptz not null default now()
);
create index if not exists ton_usdt_price_quotes_captured_idx
on public.ton_usdt_price_quotes (network, asset_code, captured_at desc);

create table if not exists public.ton_usdt_deposit_settlement_retries (
  chain_event_id uuid primary key references public.ton_usdt_chain_events(id) on delete cascade,
  invoice_id uuid references public.ton_usdt_deposit_invoices(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'manual_review')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ton_usdt_withdrawals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null check (network in ('testnet', 'mainnet')),
  asset_code text not null default 'USDT' check (asset_code = 'USDT'),
  master_address text not null,
  destination_address text not null,
  normalized_destination_address text not null,
  amount_units numeric(39, 0) not null check (amount_units > 0),
  amount_usdt numeric(30, 6) not null check (amount_usdt > 0),
  usdt_usd_rate numeric(30, 12) not null check (usdt_usd_rate > 0),
  usdt_rate_provider text not null,
  usdt_rate_source_timestamp timestamptz,
  ton_usd_rate numeric(30, 12) not null check (ton_usd_rate > 0),
  ton_rate_provider text not null,
  ton_rate_source_timestamp timestamptz,
  payout_wallet_amount numeric(30, 12) not null check (payout_wallet_amount > 0),
  service_fee_percent numeric(10, 4) not null check (service_fee_percent >= 0),
  service_fee_amount numeric(30, 12) not null check (service_fee_amount >= 0),
  network_fee_estimate_ton numeric(30, 9) not null check (network_fee_estimate_ton > 0),
  network_fee_reserve_ton numeric(30, 9) not null check (network_fee_reserve_ton > 0),
  network_fee_reserve_amount numeric(30, 12) not null check (network_fee_reserve_amount > 0),
  total_reserved_amount numeric(30, 12) not null check (total_reserved_amount > 0),
  status text not null default 'funds_reserved' check (status in ('funds_reserved', 'broadcasting', 'broadcast', 'confirmed', 'manual_review', 'failed', 'refunded')),
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
create index if not exists ton_usdt_withdrawals_user_created_idx
on public.ton_usdt_withdrawals (user_id, created_at desc);
create index if not exists ton_usdt_withdrawals_status_idx
on public.ton_usdt_withdrawals (status, created_at desc);

alter table public.ton_usdt_config enable row level security;
alter table public.ton_usdt_deposit_invoices enable row level security;
alter table public.ton_usdt_chain_cursors enable row level security;
alter table public.ton_usdt_chain_events enable row level security;
alter table public.ton_usdt_price_quotes enable row level security;
alter table public.ton_usdt_deposit_settlement_retries enable row level security;
alter table public.ton_usdt_withdrawals enable row level security;

grant select on table public.ton_usdt_deposit_invoices to authenticated;
grant select on table public.ton_usdt_withdrawals to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

drop policy if exists "Users can read own TON USDT invoices" on public.ton_usdt_deposit_invoices;
create policy "Users can read own TON USDT invoices"
on public.ton_usdt_deposit_invoices for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "Users can read own TON USDT withdrawals" on public.ton_usdt_withdrawals;
create policy "Users can read own TON USDT withdrawals"
on public.ton_usdt_withdrawals for select to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists touch_ton_usdt_config_updated_at on public.ton_usdt_config;
create trigger touch_ton_usdt_config_updated_at before update on public.ton_usdt_config for each row execute function public.touch_updated_at();
drop trigger if exists touch_ton_usdt_deposit_invoices_updated_at on public.ton_usdt_deposit_invoices;
create trigger touch_ton_usdt_deposit_invoices_updated_at before update on public.ton_usdt_deposit_invoices for each row execute function public.touch_updated_at();
drop trigger if exists touch_ton_usdt_chain_events_updated_at on public.ton_usdt_chain_events;
create trigger touch_ton_usdt_chain_events_updated_at before update on public.ton_usdt_chain_events for each row execute function public.touch_updated_at();
drop trigger if exists touch_ton_usdt_retries_updated_at on public.ton_usdt_deposit_settlement_retries;
create trigger touch_ton_usdt_retries_updated_at before update on public.ton_usdt_deposit_settlement_retries for each row execute function public.touch_updated_at();
drop trigger if exists touch_ton_usdt_withdrawals_updated_at on public.ton_usdt_withdrawals;
create trigger touch_ton_usdt_withdrawals_updated_at before update on public.ton_usdt_withdrawals for each row execute function public.touch_updated_at();

create or replace function public.create_or_reuse_ton_usdt_deposit_invoice(
  p_user_id uuid,
  p_network text,
  p_master_address text,
  p_invoice_code text,
  p_deposit_owner_address text,
  p_deposit_jetton_wallet_address text,
  p_expected_amount_units numeric,
  p_expires_at timestamptz,
  p_replace_active boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  network text,
  asset_code text,
  master_address text,
  invoice_code text,
  deposit_owner_address text,
  deposit_jetton_wallet_address text,
  expected_amount_units numeric,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reused boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice public.ton_usdt_deposit_invoices%rowtype;
begin
  if p_user_id is null or p_master_address is null or p_invoice_code is null then
    raise exception 'Missing TON USDT invoice data.';
  end if;
  if p_replace_active then
    update public.ton_usdt_deposit_invoices
    set status = 'cancelled'
    where user_id = p_user_id
      and status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate');
  else
    select * into v_invoice
    from public.ton_usdt_deposit_invoices
    where user_id = p_user_id
      and status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
      and expires_at > now()
    order by created_at desc limit 1;
    if found then
      return query select v_invoice.id, v_invoice.user_id, v_invoice.network, v_invoice.asset_code,
        v_invoice.master_address, v_invoice.invoice_code, v_invoice.deposit_owner_address,
        v_invoice.deposit_jetton_wallet_address, v_invoice.expected_amount_units, v_invoice.status,
        v_invoice.expires_at, v_invoice.created_at, v_invoice.updated_at, true;
      return;
    end if;
  end if;

  insert into public.ton_usdt_deposit_invoices (
    user_id, network, master_address, invoice_code, deposit_owner_address,
    deposit_jetton_wallet_address, expected_amount_units, expires_at
  ) values (
    p_user_id, p_network, p_master_address, p_invoice_code, p_deposit_owner_address,
    p_deposit_jetton_wallet_address, p_expected_amount_units, p_expires_at
  ) returning * into v_invoice;

  return query select v_invoice.id, v_invoice.user_id, v_invoice.network, v_invoice.asset_code,
    v_invoice.master_address, v_invoice.invoice_code, v_invoice.deposit_owner_address,
    v_invoice.deposit_jetton_wallet_address, v_invoice.expected_amount_units, v_invoice.status,
    v_invoice.expires_at, v_invoice.created_at, v_invoice.updated_at, false;
end;
$$;
revoke all on function public.create_or_reuse_ton_usdt_deposit_invoice(uuid, text, text, text, text, text, numeric, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.create_or_reuse_ton_usdt_deposit_invoice(uuid, text, text, text, text, text, numeric, timestamptz, boolean) to service_role;

create or replace function public.enqueue_ton_usdt_deposit_settlement_retry(p_chain_event_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_event public.ton_usdt_chain_events%rowtype;
  v_invoice_id uuid;
begin
  select * into v_event from public.ton_usdt_chain_events where id = p_chain_event_id for update;
  if not found then raise exception 'TON USDT chain event not found.'; end if;
  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'unmatched', 'failed') then return; end if;
  if v_event.invoice_code is not null then
    select id into v_invoice_id from public.ton_usdt_deposit_invoices where invoice_code = v_event.invoice_code limit 1;
  end if;
  insert into public.ton_usdt_deposit_settlement_retries (chain_event_id, invoice_id, status, next_attempt_at)
  values (v_event.id, v_invoice_id, 'pending', now()) on conflict (chain_event_id) do nothing;
  if v_invoice_id is not null then
    update public.ton_usdt_deposit_invoices set status = 'confirmed_pending_credit'
    where id = v_invoice_id and status in ('waiting', 'detected', 'finalizing', 'awaiting_rate');
  end if;
end;
$$;
revoke all on function public.enqueue_ton_usdt_deposit_settlement_retry(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_ton_usdt_deposit_settlement_retry(uuid) to service_role;

create or replace function public.claim_ton_usdt_deposit_settlement_retries(p_limit integer default 25)
returns table (chain_event_id uuid, attempt_count integer)
language plpgsql security definer set search_path = public
as $$
begin
  return query with due as (
    select retry.chain_event_id from public.ton_usdt_deposit_settlement_retries retry
    where (retry.status = 'pending' and retry.next_attempt_at <= now())
       or (retry.status = 'processing' and retry.locked_at < now() - interval '2 minutes')
    order by retry.next_attempt_at, retry.created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100)) for update skip locked
  )
  update public.ton_usdt_deposit_settlement_retries retry
  set status = 'processing', attempt_count = least(retry.attempt_count + 1, retry.max_attempts),
      locked_at = now(), error_code = null, error_message = null
  from due where retry.chain_event_id = due.chain_event_id
  returning retry.chain_event_id, retry.attempt_count;
end;
$$;
revoke all on function public.claim_ton_usdt_deposit_settlement_retries(integer) from public, anon, authenticated;
grant execute on function public.claim_ton_usdt_deposit_settlement_retries(integer) to service_role;

create or replace function public.fail_ton_usdt_deposit_settlement_retry(p_chain_event_id uuid, p_error_code text, p_error_message text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.ton_usdt_deposit_settlement_retries
  set status = case when attempt_count >= max_attempts then 'manual_review' else 'pending' end,
      next_attempt_at = now() + case when attempt_count <= 1 then interval '15 seconds'
        when attempt_count = 2 then interval '30 seconds' when attempt_count = 3 then interval '1 minute'
        when attempt_count = 4 then interval '2 minutes' else interval '5 minutes' end,
      locked_at = null, error_code = left(coalesce(p_error_code, 'unknown'), 120),
      error_message = left(coalesce(p_error_message, 'TON USDT settlement failed.'), 2000)
  where chain_event_id = p_chain_event_id and status = 'processing';
end;
$$;
revoke all on function public.fail_ton_usdt_deposit_settlement_retry(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fail_ton_usdt_deposit_settlement_retry(uuid, text, text) to service_role;

create or replace function public.complete_ton_usdt_deposit_settlement_retry(p_chain_event_id uuid)
returns void language sql security definer set search_path = public
as $$
  update public.ton_usdt_deposit_settlement_retries
  set status = 'completed', completed_at = coalesce(completed_at, now()), locked_at = null,
      error_code = null, error_message = null
  where chain_event_id = p_chain_event_id;
$$;
revoke all on function public.complete_ton_usdt_deposit_settlement_retry(uuid) from public, anon, authenticated;
grant execute on function public.complete_ton_usdt_deposit_settlement_retry(uuid) to service_role;

create or replace function public.settle_ton_usdt_deposit(p_chain_event_id uuid)
returns table (event_status text, credited_user_id uuid, usd_amount numeric, wallet_balance numeric, ledger_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.ton_usdt_chain_events%rowtype;
  v_invoice public.ton_usdt_deposit_invoices%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_usd_amount numeric(30, 2);
  v_status text;
  v_ledger_id uuid;
begin
  select * into v_event from public.ton_usdt_chain_events where id = p_chain_event_id for update;
  if not found then raise exception 'TON USDT chain event not found.'; end if;
  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'unmatched') then
    return query select v_event.status, v_event.settlement_user_id, coalesce(v_event.settled_usd_amount, 0)::numeric, null::numeric, v_event.settlement_ledger_id; return;
  end if;
  if v_event.status <> 'finalized' then raise exception 'TON USDT chain event is not finalized.'; end if;
  if v_event.invoice_code is null or btrim(v_event.invoice_code) = '' then
    update public.ton_usdt_chain_events set status = 'unmatched' where id = v_event.id;
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid; return;
  end if;
  select * into v_invoice from public.ton_usdt_deposit_invoices where invoice_code = v_event.invoice_code for update;
  if not found then
    update public.ton_usdt_chain_events set status = 'unmatched' where id = v_event.id;
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid; return;
  end if;
  if v_event.usdt_usd_rate is null then
    update public.ton_usdt_chain_events set status = 'awaiting_rate' where id = v_event.id;
    update public.ton_usdt_deposit_invoices set status = 'awaiting_rate' where id = v_invoice.id;
    return query select 'awaiting_rate'::text, v_invoice.user_id, 0::numeric, null::numeric, null::uuid; return;
  end if;
  select * into v_wallet from public.wallet_accounts where user_id = v_invoice.user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;
  v_usd_amount := round(v_event.amount_units / 1000000 * v_event.usdt_usd_rate, 2);
  if v_usd_amount <= 0 then raise exception 'TON USDT deposit is below the minimum Wallet precision.'; end if;
  v_status := case when v_invoice.expires_at < now() then 'credited_late'
    when v_invoice.expected_amount_units is not null and v_invoice.expected_amount_units <> v_event.amount_units then 'credited_amount_mismatch'
    else 'credited' end;
  update public.wallet_accounts set balance = balance + v_usd_amount, updated_at = now()
  where user_id = v_invoice.user_id returning * into v_wallet;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (v_invoice.user_id, 'credit', v_usd_amount, v_wallet.currency_code, 'crypto_deposit', 'crypto_deposit', v_event.id, v_wallet.balance,
    'ton_usdt_deposit:' || v_event.id::text,
    jsonb_build_object('network', v_event.network, 'asset_code', v_event.asset_code, 'master_address', v_event.master_address,
      'transaction_hash', v_event.transaction_hash, 'logical_time', v_event.logical_time, 'amount_units', v_event.amount_units,
      'decimals', 6, 'usdt_usd_rate', v_event.usdt_usd_rate, 'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp, 'rate_metadata', v_event.rate_metadata,
      'quote_currency', 'USD', 'credited_usd_amount', v_usd_amount, 'wallet_currency_code', v_wallet.currency_code,
      'finalized_at', v_event.finalized_at, 'invoice_code', v_event.invoice_code, 'invoice_status', v_status))
  returning id into v_ledger_id;
  update public.ton_usdt_chain_events set status = v_status, settled_usd_amount = v_usd_amount, settled_at = now(),
    settlement_user_id = v_invoice.user_id, settlement_ledger_id = v_ledger_id where id = v_event.id;
  update public.ton_usdt_deposit_invoices set status = v_status where id = v_invoice.id;
  return query select v_status, v_invoice.user_id, v_usd_amount, v_wallet.balance, v_ledger_id;
end;
$$;
revoke all on function public.settle_ton_usdt_deposit(uuid) from public, anon, authenticated;
grant execute on function public.settle_ton_usdt_deposit(uuid) to service_role;

create or replace function public.reserve_ton_usdt_withdrawal(
  p_withdrawal_id uuid, p_user_id uuid, p_network text, p_master_address text,
  p_destination_address text, p_normalized_destination_address text, p_amount_units numeric,
  p_amount_usdt numeric, p_usdt_usd_rate numeric, p_usdt_rate_provider text, p_usdt_rate_source_timestamp timestamptz,
  p_ton_usd_rate numeric, p_ton_rate_provider text, p_ton_rate_source_timestamp timestamptz,
  p_payout_wallet_amount numeric, p_service_fee_percent numeric, p_service_fee_amount numeric,
  p_network_fee_estimate_ton numeric, p_network_fee_reserve_ton numeric, p_network_fee_reserve_amount numeric,
  p_total_reserved_amount numeric, p_idempotency_key text
)
returns table (withdrawal_id uuid, withdrawal_status text, total_reserved_amount numeric, wallet_balance numeric, is_new boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_existing public.ton_usdt_withdrawals%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_next_balance numeric(30, 12);
begin
  select * into v_existing from public.ton_usdt_withdrawals where user_id = p_user_id and idempotency_key = p_idempotency_key for update;
  if found then
    select balance into v_next_balance from public.wallet_accounts where user_id = p_user_id;
    return query select v_existing.id, v_existing.status, v_existing.total_reserved_amount, v_next_balance, false; return;
  end if;
  if p_withdrawal_id is null or p_user_id is null or p_idempotency_key is null or btrim(p_idempotency_key) = '' then raise exception 'Missing TON USDT withdrawal idempotency data.'; end if;
  if p_total_reserved_amount is null or p_total_reserved_amount <= 0 then raise exception 'TON USDT withdrawal reserve must be greater than 0.'; end if;
  select * into v_wallet from public.wallet_accounts where user_id = p_user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;
  if v_wallet.balance < p_total_reserved_amount then raise exception 'Insufficient wallet balance for withdrawal and fees.'; end if;
  v_next_balance := v_wallet.balance - p_total_reserved_amount;
  insert into public.ton_usdt_withdrawals (
    id, user_id, network, master_address, destination_address, normalized_destination_address, amount_units, amount_usdt,
    usdt_usd_rate, usdt_rate_provider, usdt_rate_source_timestamp, ton_usd_rate, ton_rate_provider, ton_rate_source_timestamp,
    payout_wallet_amount, service_fee_percent, service_fee_amount, network_fee_estimate_ton, network_fee_reserve_ton,
    network_fee_reserve_amount, total_reserved_amount, idempotency_key
  ) values (
    p_withdrawal_id, p_user_id, p_network, p_master_address, p_destination_address, p_normalized_destination_address, p_amount_units, p_amount_usdt,
    p_usdt_usd_rate, p_usdt_rate_provider, p_usdt_rate_source_timestamp, p_ton_usd_rate, p_ton_rate_provider, p_ton_rate_source_timestamp,
    p_payout_wallet_amount, p_service_fee_percent, p_service_fee_amount, p_network_fee_estimate_ton, p_network_fee_reserve_ton,
    p_network_fee_reserve_amount, p_total_reserved_amount, p_idempotency_key
  );
  update public.wallet_accounts set balance = v_next_balance, updated_at = now() where user_id = p_user_id;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (p_user_id, 'debit', p_total_reserved_amount, v_wallet.currency_code, 'crypto_withdrawal', 'crypto_withdrawal', p_withdrawal_id, v_next_balance,
    'ton_usdt_withdrawal:' || p_withdrawal_id::text || ':reserve',
    jsonb_build_object('network', p_network, 'asset_code', 'USDT', 'master_address', p_master_address, 'amount_usdt', p_amount_usdt,
      'amount_units', p_amount_units, 'decimals', 6, 'payout_wallet_amount', p_payout_wallet_amount, 'service_fee_percent', p_service_fee_percent,
      'service_fee_amount', p_service_fee_amount, 'network_fee_estimate_ton', p_network_fee_estimate_ton,
      'network_fee_reserve_ton', p_network_fee_reserve_ton, 'network_fee_reserve_amount', p_network_fee_reserve_amount,
      'usdt_usd_rate', p_usdt_usd_rate, 'usdt_rate_provider', p_usdt_rate_provider, 'ton_usd_rate', p_ton_usd_rate,
      'ton_rate_provider', p_ton_rate_provider, 'destination_address', p_normalized_destination_address, 'withdrawal_status', 'funds_reserved'));
  return query select p_withdrawal_id, 'funds_reserved'::text, p_total_reserved_amount, v_next_balance, true;
end;
$$;
revoke all on function public.reserve_ton_usdt_withdrawal(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, timestamptz, numeric, text, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public;
grant execute on function public.reserve_ton_usdt_withdrawal(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, timestamptz, numeric, text, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to service_role;

create or replace function public.begin_ton_usdt_withdrawal_broadcast(p_withdrawal_id uuid)
returns table (claimed boolean, withdrawal_status text)
language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  update public.ton_usdt_withdrawals set status = 'broadcasting' where id = p_withdrawal_id and status = 'funds_reserved' returning true, status into claimed, withdrawal_status;
  if claimed is not null then return query select claimed, withdrawal_status; return; end if;
  select status into v_status from public.ton_usdt_withdrawals where id = p_withdrawal_id;
  return query select false, v_status;
end;
$$;
revoke all on function public.begin_ton_usdt_withdrawal_broadcast(uuid) from public;
grant execute on function public.begin_ton_usdt_withdrawal_broadcast(uuid) to service_role;

create or replace function public.complete_ton_usdt_withdrawal_broadcast(p_withdrawal_id uuid, p_source_address text, p_seqno bigint, p_message_hash text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.ton_usdt_withdrawals set status = 'broadcast', source_address = p_source_address, seqno = p_seqno,
    message_hash = p_message_hash, broadcast_at = now(), error_code = null, error_message = null
  where id = p_withdrawal_id and status = 'broadcasting';
  update public.wallet_ledger set metadata = metadata || jsonb_build_object('withdrawal_status', 'broadcast', 'source_address', p_source_address, 'seqno', p_seqno, 'message_hash', p_message_hash)
  where source_id = p_withdrawal_id and operation_type = 'crypto_withdrawal' and direction = 'debit';
end;
$$;
revoke all on function public.complete_ton_usdt_withdrawal_broadcast(uuid, text, bigint, text) from public;
grant execute on function public.complete_ton_usdt_withdrawal_broadcast(uuid, text, bigint, text) to service_role;

create or replace function public.refund_ton_usdt_withdrawal(p_withdrawal_id uuid, p_error_code text, p_error_message text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_withdrawal public.ton_usdt_withdrawals%rowtype; v_wallet public.wallet_accounts%rowtype; v_next_balance numeric(30, 12);
begin
  select * into v_withdrawal from public.ton_usdt_withdrawals where id = p_withdrawal_id for update;
  if not found or v_withdrawal.status not in ('funds_reserved', 'broadcasting') then return; end if;
  select * into v_wallet from public.wallet_accounts where user_id = v_withdrawal.user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;
  v_next_balance := v_wallet.balance + v_withdrawal.total_reserved_amount;
  update public.wallet_accounts set balance = v_next_balance, updated_at = now() where user_id = v_withdrawal.user_id;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (v_withdrawal.user_id, 'credit', v_withdrawal.total_reserved_amount, v_wallet.currency_code, 'crypto_withdrawal', 'crypto_withdrawal', v_withdrawal.id, v_next_balance,
    'ton_usdt_withdrawal:' || v_withdrawal.id::text || ':refund', jsonb_build_object('withdrawal_status', 'refunded', 'error_code', p_error_code, 'error_message', p_error_message));
  update public.ton_usdt_withdrawals set status = 'refunded', error_code = p_error_code, error_message = p_error_message, refunded_at = now() where id = v_withdrawal.id;
end;
$$;
revoke all on function public.refund_ton_usdt_withdrawal(uuid, text, text) from public;
grant execute on function public.refund_ton_usdt_withdrawal(uuid, text, text) to service_role;

create or replace function public.mark_ton_usdt_withdrawal_manual_review(p_withdrawal_id uuid, p_error_code text, p_error_message text)
returns void language sql security definer set search_path = public
as $$
  update public.ton_usdt_withdrawals set status = 'manual_review', error_code = p_error_code, error_message = p_error_message
  where id = p_withdrawal_id and status = 'broadcasting';
$$;
revoke all on function public.mark_ton_usdt_withdrawal_manual_review(uuid, text, text) from public;
grant execute on function public.mark_ton_usdt_withdrawal_manual_review(uuid, text, text) to service_role;