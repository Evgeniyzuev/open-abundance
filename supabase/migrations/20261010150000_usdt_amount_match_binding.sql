-- Bind the sender address after an exact-amount match too.
--
-- The exact amount is a secret shown only to the invoice holder for ten minutes, so paying it proves
-- control of the sending address just as the invoice comment does. The settlement worker therefore
-- binds the sender for amount matches as well, with the same safeguards: busy exchange-like
-- addresses and addresses owned by another account are never bound. This replaces the
-- amount-match-never-binds rule of the previous migration.

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
  v_candidates integer;
  v_by_amount boolean := false;
begin
  select * into v_event from public.ton_usdt_chain_events where id = p_chain_event_id for update;
  if not found then raise exception 'TON USDT chain event not found.'; end if;
  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'credited_bound_sender', 'unmatched') then
    return query select v_event.status, v_event.settlement_user_id, coalesce(v_event.settled_usd_amount, 0)::numeric, null::numeric, v_event.settlement_ledger_id; return;
  end if;
  if v_event.status <> 'finalized' then raise exception 'TON USDT chain event is not finalized.'; end if;

  -- 1. comment
  if v_event.invoice_code is not null and btrim(v_event.invoice_code) <> '' then
    select * into v_invoice from public.ton_usdt_deposit_invoices where invoice_code = v_event.invoice_code for update;
  end if;

  if v_invoice.id is null then
    -- 2. bound sender
    if exists (
      select 1 from public.ton_usdt_bound_senders as bound
      where bound.sender_owner_address = v_event.sender_owner_address and bound.network = v_event.network
    ) then
      return query select * from public.credit_ton_usdt_event_to_bound_sender(v_event.id);
      return;
    end if;

    -- 3. exact amount inside an open window; exactly one candidate or nothing
    select count(*) into v_candidates
    from public.ton_usdt_deposit_invoices as candidate
    where candidate.status = 'waiting'
      and candidate.network = v_event.network
      and candidate.master_address = v_event.master_address
      and candidate.expected_amount_units = v_event.amount_units
      and candidate.amount_window_started_at is not null
      and v_event.finalized_at >= candidate.amount_window_started_at - interval '30 seconds'
      and v_event.finalized_at <= candidate.amount_window_started_at + interval '10 minutes';

    if v_candidates = 1 then
      select candidate.* into v_invoice
      from public.ton_usdt_deposit_invoices as candidate
      where candidate.status = 'waiting'
        and candidate.network = v_event.network
        and candidate.master_address = v_event.master_address
        and candidate.expected_amount_units = v_event.amount_units
        and candidate.amount_window_started_at is not null
        and v_event.finalized_at >= candidate.amount_window_started_at - interval '30 seconds'
        and v_event.finalized_at <= candidate.amount_window_started_at + interval '10 minutes'
      for update;
      v_by_amount := true;
    end if;
  end if;

  if v_invoice.id is null then
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
      'finalized_at', v_event.finalized_at, 'invoice_code', v_invoice.invoice_code, 'invoice_status', v_status,
      'attribution', case when v_by_amount then 'amount_window' else 'comment' end))
  returning id into v_ledger_id;
  -- The invoice is recorded on the event so the deposit screen can find it. The sender address is
  -- bound afterwards by the settlement worker for comment and amount matches alike, after it checks
  -- that the address does not look shared.
  update public.ton_usdt_chain_events set status = v_status, settled_usd_amount = v_usd_amount, settled_at = now(),
    settlement_user_id = v_invoice.user_id, settlement_ledger_id = v_ledger_id,
    invoice_code = coalesce(invoice_code, v_invoice.invoice_code)
  where id = v_event.id;
  update public.ton_usdt_deposit_invoices set status = v_status where id = v_invoice.id;
  return query select v_status, v_invoice.user_id, v_usd_amount, v_wallet.balance, v_ledger_id;
end;
$$;

revoke all on function public.settle_ton_usdt_deposit(uuid) from public, anon, authenticated;
grant execute on function public.settle_ton_usdt_deposit(uuid) to service_role;
