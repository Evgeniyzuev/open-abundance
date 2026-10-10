-- Manual assignment of an unmatched USDT deposit to an account, with the reason recorded.
--
-- Last resort for a verified on-chain deposit that the automatic rules (comment, bound sender,
-- exact amount) could not attribute, when the account owner can prove it is theirs. Service role
-- only. It never binds the sender address: that decision is separate and has its own safeguards.

create or replace function public.assign_unmatched_ton_usdt_deposit(
  p_chain_event_id uuid,
  p_user_id uuid,
  p_reason text
)
returns table (event_status text, credited_user_id uuid, usd_amount numeric, wallet_balance numeric, ledger_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.ton_usdt_chain_events%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_usd_amount numeric(30, 2);
  v_ledger_id uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'A reason of at least 10 characters is required.';
  end if;

  select event.* into v_event
  from public.ton_usdt_chain_events as event
  where event.id = p_chain_event_id
  for update;
  if not found then raise exception 'TON USDT chain event not found.'; end if;
  if v_event.status <> 'unmatched' or v_event.settlement_user_id is not null then
    raise exception 'Only an unmatched, unsettled deposit can be assigned (status: %).', v_event.status;
  end if;
  if v_event.usdt_usd_rate is null then raise exception 'The deposit has no recorded rate.'; end if;

  select wallet.* into v_wallet from public.wallet_accounts as wallet where wallet.user_id = p_user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;

  v_usd_amount := round(v_event.amount_units / 1000000 * v_event.usdt_usd_rate, 2);
  if v_usd_amount <= 0 then raise exception 'TON USDT deposit is below the minimum Wallet precision.'; end if;

  update public.wallet_accounts as wallet
  set balance = wallet.balance + v_usd_amount, updated_at = now()
  where wallet.user_id = p_user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (p_user_id, 'credit', v_usd_amount, v_wallet.currency_code, 'crypto_deposit', 'crypto_deposit', v_event.id, v_wallet.balance,
    'ton_usdt_deposit:' || v_event.id::text,
    jsonb_build_object('network', v_event.network, 'asset_code', v_event.asset_code, 'master_address', v_event.master_address,
      'transaction_hash', v_event.transaction_hash, 'logical_time', v_event.logical_time, 'amount_units', v_event.amount_units,
      'decimals', 6, 'usdt_usd_rate', v_event.usdt_usd_rate, 'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp, 'rate_metadata', v_event.rate_metadata,
      'quote_currency', 'USD', 'credited_usd_amount', v_usd_amount, 'wallet_currency_code', v_wallet.currency_code,
      'finalized_at', v_event.finalized_at, 'attribution', 'manual_assignment', 'reason', left(btrim(p_reason), 500)))
  returning id into v_ledger_id;

  update public.ton_usdt_chain_events as target
  set status = 'credited', settled_usd_amount = v_usd_amount, settled_at = now(),
      settlement_user_id = p_user_id, settlement_ledger_id = v_ledger_id, sender_binding_result = 'not_bound_manual'
  where target.id = v_event.id;

  return query select 'credited'::text, p_user_id, v_usd_amount::numeric, v_wallet.balance::numeric, v_ledger_id;
end;
$$;

revoke all on function public.assign_unmatched_ton_usdt_deposit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_unmatched_ton_usdt_deposit(uuid, uuid, text) to service_role;
