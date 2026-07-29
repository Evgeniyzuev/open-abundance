alter table public.ton_chain_events
alter column settled_usd_amount type numeric(30, 6)
using settled_usd_amount::numeric(30, 6);

create or replace function public.create_or_reuse_ton_deposit_invoice(
  p_user_id uuid,
  p_network text,
  p_asset_code text,
  p_invoice_code text,
  p_deposit_address text,
  p_expected_amount_nano numeric,
  p_expires_at timestamptz,
  p_replace_active boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  network text,
  asset_code text,
  invoice_code text,
  deposit_address text,
  expected_amount_nano numeric,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.ton_deposit_invoices%rowtype;
  v_invoice_id uuid;
begin
  if p_user_id is null then
    raise exception 'TON deposit user is required.';
  end if;

  if p_expected_amount_nano is not null and p_expected_amount_nano <= 0 then
    raise exception 'Expected TON amount must be positive.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::text || ':' || p_network || ':' || p_asset_code,
      0
    )
  );

  update public.ton_deposit_invoices as invoice
  set status = 'expired'
  where invoice.user_id = p_user_id
    and invoice.network = p_network
    and invoice.asset_code = p_asset_code
    and invoice.status = 'waiting'
    and invoice.expires_at <= now();

  select invoice.*
  into v_invoice
  from public.ton_deposit_invoices as invoice
  where invoice.user_id = p_user_id
    and invoice.network = p_network
    and invoice.asset_code = p_asset_code
    and invoice.status = 'waiting'
    and invoice.expires_at > now()
  order by invoice.created_at desc
  limit 1
  for update;

  if found and not p_replace_active then
    return query
    select
      v_invoice.id,
      v_invoice.user_id,
      v_invoice.network,
      v_invoice.asset_code,
      v_invoice.invoice_code,
      v_invoice.deposit_address,
      v_invoice.expected_amount_nano,
      v_invoice.status,
      v_invoice.expires_at,
      v_invoice.created_at,
      v_invoice.updated_at,
      true;
    return;
  end if;

  if found then
    update public.ton_deposit_invoices as invoice
    set status = 'expired',
        expires_at = now()
    where invoice.id = v_invoice.id;
  end if;

  insert into public.ton_deposit_invoices (
    user_id,
    network,
    asset_code,
    invoice_code,
    deposit_address,
    expected_amount_nano,
    expires_at
  ) values (
    p_user_id,
    p_network,
    p_asset_code,
    p_invoice_code,
    p_deposit_address,
    p_expected_amount_nano,
    p_expires_at
  )
  returning ton_deposit_invoices.id into v_invoice_id;

  select invoice.*
  into strict v_invoice
  from public.ton_deposit_invoices as invoice
  where invoice.id = v_invoice_id;

  return query
  select
    v_invoice.id,
    v_invoice.user_id,
    v_invoice.network,
    v_invoice.asset_code,
    v_invoice.invoice_code,
    v_invoice.deposit_address,
    v_invoice.expected_amount_nano,
    v_invoice.status,
    v_invoice.expires_at,
    v_invoice.created_at,
    v_invoice.updated_at,
    false;
end;
$$;

revoke all on function public.create_or_reuse_ton_deposit_invoice(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  timestamptz,
  boolean
) from public, anon, authenticated;
grant execute on function public.create_or_reuse_ton_deposit_invoice(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  timestamptz,
  boolean
) to service_role;

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
  v_usd_amount numeric(30, 6);
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

  v_usd_amount := round(v_event.amount_nano / 1000000000 * v_event.ton_usd_rate, 6);
  if v_usd_amount <= 0 then
    raise exception 'TON deposit is below the minimum Wallet precision.';
  end if;

  v_status := case
    when v_invoice.expires_at < now()
      or v_invoice.status in ('credited', 'credited_late', 'credited_amount_mismatch')
      then 'credited_late'
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
      'amount_nano', v_event.amount_nano::text,
      'ton_usd_rate', v_event.ton_usd_rate::text,
      'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp,
      'quote_currency', 'USD',
      'credited_usd_amount', v_usd_amount::text,
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
