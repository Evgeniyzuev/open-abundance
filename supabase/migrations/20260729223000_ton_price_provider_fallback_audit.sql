alter table public.ton_chain_events
add column if not exists rate_metadata jsonb not null default '{}'::jsonb;

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
    return query select
      v_event.status,
      v_event.settlement_user_id,
      coalesce(v_event.settled_usd_amount, 0)::numeric,
      null::numeric,
      v_event.settlement_ledger_id;
    return;
  end if;

  if v_event.status <> 'finalized' then
    raise exception 'TON chain event is not finalized.';
  end if;

  if v_event.invoice_code is null or btrim(v_event.invoice_code) = '' then
    update public.ton_chain_events set status = 'unmatched' where id = v_event.id;
    perform public.complete_ton_deposit_settlement_retry(v_event.id);
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_invoice
  from public.ton_deposit_invoices
  where invoice_code = v_event.invoice_code
  for update;

  if not found then
    update public.ton_chain_events set status = 'unmatched' where id = v_event.id;
    perform public.complete_ton_deposit_settlement_retry(v_event.id);
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_event.ton_usd_rate is null then
    update public.ton_chain_events set status = 'awaiting_rate' where id = v_event.id;
    update public.ton_deposit_invoices set status = 'awaiting_rate' where id = v_invoice.id;
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
    when v_invoice.status in (
      'credited',
      'credited_late',
      'credited_amount_mismatch',
      'rejected',
      'cancelled',
      'expired'
    ) then 'credited_late'
    when v_invoice.expected_amount_nano is not null
      and v_invoice.expected_amount_nano <> v_event.amount_nano
      then 'credited_amount_mismatch'
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
      'rate_metadata', v_event.rate_metadata,
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

  perform public.complete_ton_deposit_settlement_retry(v_event.id);
  return query select v_status, v_invoice.user_id, v_usd_amount, v_wallet.balance, v_ledger_id;
end;
$$;

revoke all on function public.settle_ton_deposit(uuid) from public;
grant execute on function public.settle_ton_deposit(uuid) to service_role;
