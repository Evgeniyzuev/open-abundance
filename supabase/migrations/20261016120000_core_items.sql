-- Core items: collectible garden items whose first purchase from the system tops up the buyer's Core.
--
-- The catalog (keys, titles, rarity, price) lives in lib/coreItems.ts and the server route passes the
-- already validated values here. One transaction moves exactly the price P from Wallet to Core through
-- the existing wallet_core_topup (same locks, checks, ledger row and redemption guard as a plain top-up)
-- and mints a transferable user_artifacts row marked core_bonus_applied. No Core is created beyond P.
-- A resale of the item in Market is an ordinary item deal and never calls this function, so the Core
-- effect happens once per item. Execute is granted to service_role only.

create or replace function public.buy_core_item(
  p_user_id uuid,
  p_item_key text,
  p_title text,
  p_description text,
  p_rarity text,
  p_price numeric,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table (
  artifact_id uuid,
  wallet_balance_after numeric,
  core_balance_after numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_artifact_id uuid := gen_random_uuid();
  existing_ledger public.wallet_ledger%rowtype;
  ledger_id uuid;
  wallet_after numeric;
  core_after numeric;
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

  if coalesce(p_idempotency_key, '') <> '' then
    select * into existing_ledger
    from public.wallet_ledger
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      select balance into core_after from public.core_accounts where user_id = p_user_id;
      return query select existing_ledger.source_id, existing_ledger.balance_after, core_after;
      return;
    end if;
  end if;

  -- Debits Wallet and credits Core by exactly p_price; raises on a missing account, a low balance
  -- or a pending Core redemption.
  select topup.wallet_ledger_id into ledger_id
  from public.wallet_core_topup(p_user_id, p_price, new_artifact_id, nullif(p_idempotency_key, '')) as topup;

  update public.wallet_ledger
  set metadata = metadata || jsonb_build_object('item_key', p_item_key, 'core_item', true)
  where id = ledger_id
  returning balance_after into wallet_after;

  select balance into core_after from public.core_accounts where user_id = p_user_id;

  insert into public.user_artifacts (
    id, user_id, artifact_type, title, description, rarity, visibility, transferable, source_type, metadata
  )
  values (
    new_artifact_id, p_user_id, 'core_item', p_title, p_description, p_rarity, 'public', true, 'system',
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('item_key', p_item_key, 'core_bonus_applied', true, 'core_amount', p_price, 'core_applied_at', now())
  );

  return query select new_artifact_id, wallet_after, core_after;
end;
$$;

revoke all on function public.buy_core_item(uuid, text, text, text, text, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.buy_core_item(uuid, text, text, text, text, numeric, jsonb, text) to service_role;
