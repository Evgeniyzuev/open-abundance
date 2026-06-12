create or replace function public.wallet_core_topup(
  p_user_id uuid,
  p_amount numeric,
  p_source_id uuid default gen_random_uuid(),
  p_idempotency_key text default null
)
returns table (
  wallet_ledger_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_wallet public.wallet_accounts%rowtype;
  locked_core public.core_accounts%rowtype;
  next_wallet_balance numeric(30, 12);
  next_core_balance numeric(30, 12);
  inserted_ledger_id uuid;
begin
  if p_user_id is null then
    raise exception 'Missing user id.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0.';
  end if;

  select *
  into locked_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Wallet is not created yet.';
  end if;

  select *
  into locked_core
  from public.core_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Core is not created yet.';
  end if;

  if locked_wallet.balance < p_amount then
    raise exception 'Insufficient wallet balance.';
  end if;

  next_wallet_balance := locked_wallet.balance - p_amount;
  next_core_balance := locked_core.balance + p_amount;

  update public.wallet_accounts
  set balance = next_wallet_balance,
      updated_at = now()
  where user_id = p_user_id;

  update public.core_accounts
  set balance = next_core_balance,
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
  )
  values (
    p_user_id,
    'debit',
    p_amount,
    locked_wallet.currency_code,
    'wallet_core_topup',
    'core_topup',
    coalesce(p_source_id, gen_random_uuid()),
    next_wallet_balance,
    p_idempotency_key,
    jsonb_build_object(
      'core_balance_after',
      next_core_balance
    )
  )
  returning id into inserted_ledger_id;

  return query select inserted_ledger_id;
end;
$$;

revoke all on function public.wallet_core_topup(uuid, numeric, uuid, text) from public;
revoke all on function public.wallet_core_topup(uuid, numeric, uuid, text) from anon;
revoke all on function public.wallet_core_topup(uuid, numeric, uuid, text) from authenticated;

grant execute on function public.wallet_core_topup(uuid, numeric, uuid, text) to service_role;
