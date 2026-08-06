-- Wallet-to-Wallet: make the idempotency key mandatory for already deployed RPCs.
-- Transfers remain fee-free and have no amount or daily limits.

create or replace function public.wallet_transfer(
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_amount numeric,
  p_source_type text default 'wallet_transfer',
  p_source_id uuid default gen_random_uuid(),
  p_idempotency_key text default null
)
returns table (
  sender_wallet_ledger_id uuid,
  recipient_wallet_ledger_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  sender_wallet public.wallet_accounts%rowtype;
  recipient_wallet public.wallet_accounts%rowtype;
  next_sender_balance numeric(30, 12);
  next_recipient_balance numeric(30, 12);
  transfer_source_id uuid;
  transfer_source_type text;
  sender_key text;
  recipient_key text;
  existing_sender_ledger_id uuid;
  existing_recipient_ledger_id uuid;
begin
  if p_sender_user_id is null or p_recipient_user_id is null then
    raise exception 'Missing wallet transfer user id.';
  end if;
  if p_sender_user_id = p_recipient_user_id then
    raise exception 'Cannot transfer Wallet to yourself.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0.';
  end if;
  if scale(p_amount) > 12 then
    raise exception 'Amount exceeds OA$ precision.';
  end if;
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required.';
  end if;

  transfer_source_type := coalesce(nullif(p_source_type, ''), 'wallet_transfer');
  if transfer_source_type not in ('wallet_transfer', 'marketplace_deal', 'manual', 'system', 'challenge') then
    raise exception 'Unsupported wallet transfer source type.';
  end if;
  sender_key := trim(p_idempotency_key) || ':debit';
  recipient_key := trim(p_idempotency_key) || ':credit';

  select id into existing_sender_ledger_id
    from public.wallet_ledger where idempotency_key = sender_key limit 1;
  select id into existing_recipient_ledger_id
    from public.wallet_ledger where idempotency_key = recipient_key limit 1;
  if existing_sender_ledger_id is not null and existing_recipient_ledger_id is not null then
    return query select existing_sender_ledger_id, existing_recipient_ledger_id;
    return;
  end if;
  if existing_sender_ledger_id is not null or existing_recipient_ledger_id is not null then
    raise exception 'Wallet transfer idempotency state is incomplete.';
  end if;

  select source_id into transfer_source_id
    from public.wallet_ledger where idempotency_key = sender_key limit 1;
  transfer_source_id := coalesce(transfer_source_id, p_source_id, gen_random_uuid());

  perform 1
    from public.wallet_accounts
    where user_id in (p_sender_user_id, p_recipient_user_id)
    order by user_id
    for update;
  select id into existing_sender_ledger_id
    from public.wallet_ledger where idempotency_key = sender_key limit 1;
  select id into existing_recipient_ledger_id
    from public.wallet_ledger where idempotency_key = recipient_key limit 1;
  if existing_sender_ledger_id is not null and existing_recipient_ledger_id is not null then
    return query select existing_sender_ledger_id, existing_recipient_ledger_id;
    return;
  end if;
  if existing_sender_ledger_id is not null or existing_recipient_ledger_id is not null then
    raise exception 'Wallet transfer idempotency state is incomplete.';
  end if;
  select * into sender_wallet from public.wallet_accounts where user_id = p_sender_user_id;
  if not found then raise exception 'Sender Wallet is not created yet.'; end if;
  select * into recipient_wallet from public.wallet_accounts where user_id = p_recipient_user_id;
  if not found then raise exception 'Recipient Wallet is not created yet.'; end if;
  if sender_wallet.balance < p_amount then raise exception 'Insufficient wallet balance.'; end if;

  next_sender_balance := sender_wallet.balance - p_amount;
  next_recipient_balance := recipient_wallet.balance + p_amount;
  update public.wallet_accounts set balance = next_sender_balance, updated_at = now() where user_id = p_sender_user_id;
  update public.wallet_accounts set balance = next_recipient_balance, updated_at = now() where user_id = p_recipient_user_id;

  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    counterparty_user_id, balance_after, idempotency_key, metadata
  ) values (
    p_sender_user_id, 'debit', p_amount, sender_wallet.currency_code, 'wallet_transfer', transfer_source_type,
    transfer_source_id, p_recipient_user_id, next_sender_balance, sender_key,
    jsonb_build_object('transfer_role', 'sender')
  ) returning id into sender_wallet_ledger_id;

  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    counterparty_user_id, balance_after, idempotency_key, metadata
  ) values (
    p_recipient_user_id, 'credit', p_amount, recipient_wallet.currency_code, 'wallet_transfer', transfer_source_type,
    transfer_source_id, p_sender_user_id, next_recipient_balance, recipient_key,
    jsonb_build_object('transfer_role', 'recipient')
  ) returning id into recipient_wallet_ledger_id;
  return query select sender_wallet_ledger_id, recipient_wallet_ledger_id;
end;
$$;

revoke all on function public.wallet_transfer(uuid, uuid, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.wallet_transfer(uuid, uuid, numeric, text, uuid, text) to service_role;
