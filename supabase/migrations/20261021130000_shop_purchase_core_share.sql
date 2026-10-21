-- Purchases from the system shop ("Лавка") now add a share of the price to the buyer's Core.
--
-- The share is set per product in lib/sacredItems.ts (coreShare) from the product economics (founder decision
-- 2026-10-21) and the server passes the already computed Core amount. The paid $ still leave circulation; the Core
-- amount is a bonus funded by the product margin. The credit happens once, with the purchase; a resale in Market
-- is an ordinary item deal and never calls this function. The ledger row keeps the bonus in metadata.core_bonus,
-- which the Core sources summary reads. Execute stays with service_role only.

drop function if exists public.buy_system_item(uuid, text, text, text, text, numeric, jsonb, text);

create or replace function public.buy_system_item(
  p_user_id uuid,
  p_item_key text,
  p_title text,
  p_description text,
  p_rarity text,
  p_price numeric,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_core_bonus numeric default 0
)
returns table (
  artifact_id uuid,
  balance_after numeric,
  core_bonus numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  wallet public.wallet_accounts%rowtype;
  next_balance numeric(30, 12);
  new_artifact_id uuid := gen_random_uuid();
  existing_ledger public.wallet_ledger%rowtype;
  bonus numeric := coalesce(p_core_bonus, 0);
begin
  if p_user_id is null or coalesce(p_item_key, '') = '' or coalesce(p_title, '') = '' then
    raise exception 'Missing shop item data.';
  end if;

  if p_price is null or p_price <= 0 then
    raise exception 'Amount must be greater than 0.';
  end if;

  if p_rarity not in ('common', 'uncommon', 'rare', 'epic', 'legendary') then
    raise exception 'Unsupported item rarity.';
  end if;

  if bonus < 0 or bonus > p_price * 0.5 then
    raise exception 'Unsupported Core bonus.';
  end if;

  if coalesce(p_idempotency_key, '') <> '' then
    select * into existing_ledger
    from public.wallet_ledger
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return query select existing_ledger.source_id, existing_ledger.balance_after,
        coalesce((existing_ledger.metadata ->> 'core_bonus')::numeric, 0);
      return;
    end if;
  end if;

  select * into wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Wallet is not created yet.';
  end if;

  if wallet.balance < p_price then
    raise exception 'Insufficient wallet balance.';
  end if;

  if bonus > 0 then
    perform 1 from public.core_accounts where user_id = p_user_id for update;
    if not found then
      raise exception 'Core is not created yet.';
    end if;
  end if;

  next_balance := wallet.balance - p_price;

  update public.wallet_accounts
  set balance = next_balance, updated_at = now()
  where user_id = p_user_id;

  if bonus > 0 then
    update public.core_accounts
    set balance = balance + bonus, updated_at = now()
    where user_id = p_user_id;
  end if;

  insert into public.user_artifacts (
    id, user_id, artifact_type, title, description, rarity, visibility, transferable, source_type, metadata
  )
  values (
    new_artifact_id, p_user_id, 'sacred_item', p_title, p_description, p_rarity, 'public', true, 'system',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('item_key', p_item_key, 'core_bonus', bonus)
  );

  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    balance_after, idempotency_key, metadata
  )
  values (
    p_user_id, 'debit', p_price, wallet.currency_code, 'system_shop_purchase', 'system', new_artifact_id,
    next_balance, nullif(p_idempotency_key, ''),
    jsonb_build_object('item_key', p_item_key, 'core_bonus', bonus)
  );

  return query select new_artifact_id, next_balance, bonus;
end;
$$;

revoke all on function public.buy_system_item(uuid, text, text, text, text, numeric, jsonb, text, numeric) from public, anon, authenticated;
grant execute on function public.buy_system_item(uuid, text, text, text, text, numeric, jsonb, text, numeric) to service_role;
