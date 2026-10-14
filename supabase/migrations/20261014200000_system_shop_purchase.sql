-- System shop: a user buys a collectible item from the system for internal $.
--
-- The catalog (keys, titles, rarity, price) lives in lib/sacredItems.ts and the server route passes the
-- already validated values here. The RPC debits Wallet, writes the ledger row and mints a transferable
-- user_artifacts row in one transaction, so the item can later be resold in Market like any other item.
-- The paid $ leave circulation (they are not credited to anyone). Execute is granted to service_role only.
--
-- Also widens the item rarity ladder and adds the "contract": two items of one rarity are consumed and
-- replaced with one item of the next rarity. Nothing else about items or Market changes.

do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'public.user_artifacts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%rarity%';

  if con is not null then
    execute format('alter table public.user_artifacts drop constraint %I', con);
  end if;

  alter table public.user_artifacts
    add constraint user_artifacts_rarity_check
    check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'system'));
end;
$$;

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'wallet_ledger_operation_type_check'
    and conrelid = 'public.wallet_ledger'::regclass;

  if def is not null and position('system_shop_purchase' in def) = 0 then
    alter table public.wallet_ledger drop constraint wallet_ledger_operation_type_check;
    execute 'alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check '
      || replace(def, '''system_adjustment''::text', '''system_adjustment''::text, ''system_shop_purchase''::text');
  end if;

  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'wallet_ledger_operation_type_check'
    and conrelid = 'public.wallet_ledger'::regclass;

  if def is null or position('system_shop_purchase' in def) = 0 then
    raise exception 'wallet_ledger_operation_type_check does not allow system_shop_purchase';
  end if;
end;
$$;

create or replace function public.buy_system_item(
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
  balance_after numeric
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
      return query select existing_ledger.source_id, existing_ledger.balance_after;
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

  next_balance := wallet.balance - p_price;

  update public.wallet_accounts
  set balance = next_balance, updated_at = now()
  where user_id = p_user_id;

  insert into public.user_artifacts (
    id, user_id, artifact_type, title, description, rarity, visibility, transferable, source_type, metadata
  )
  values (
    new_artifact_id, p_user_id, 'sacred_item', p_title, p_description, p_rarity, 'public', true, 'system',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('item_key', p_item_key)
  );

  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    balance_after, idempotency_key, metadata
  )
  values (
    p_user_id, 'debit', p_price, wallet.currency_code, 'system_shop_purchase', 'system', new_artifact_id,
    next_balance, nullif(p_idempotency_key, ''), jsonb_build_object('item_key', p_item_key)
  );

  return query select new_artifact_id, next_balance;
end;
$$;

revoke all on function public.buy_system_item(uuid, text, text, text, text, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.buy_system_item(uuid, text, text, text, text, numeric, jsonb, text) to service_role;

-- Contract: consumes two sacred items of one rarity and mints one item of the next rarity.
-- The server picks the result from the catalog; this function validates ownership and state.
create or replace function public.merge_system_items(
  p_user_id uuid,
  p_artifact_ids uuid[],
  p_item_key text,
  p_title text,
  p_description text,
  p_rarity text,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  ladder constant text[] := array['common', 'uncommon', 'rare', 'epic', 'legendary'];
  locked_count integer;
  input_rarity text;
  distinct_rarities integer;
  new_artifact_id uuid := gen_random_uuid();
  consumed_id uuid;
begin
  if p_user_id is null or coalesce(p_item_key, '') = '' or coalesce(p_title, '') = '' then
    raise exception 'Missing shop item data.';
  end if;

  if p_artifact_ids is null or cardinality(p_artifact_ids) <> 2 or p_artifact_ids[1] = p_artifact_ids[2] then
    raise exception 'A contract needs two different items.';
  end if;

  if coalesce(p_idempotency_key, '') <> '' then
    select id into new_artifact_id
    from public.user_artifacts
    where user_id = p_user_id and metadata ->> 'merge_key' = p_idempotency_key
    limit 1;

    if found then
      return new_artifact_id;
    end if;
    new_artifact_id := gen_random_uuid();
  end if;

  select count(*), min(rarity), count(distinct rarity)
  into locked_count, input_rarity, distinct_rarities
  from (
    select rarity
    from public.user_artifacts
    where id = any (p_artifact_ids)
      and user_id = p_user_id
      and artifact_type = 'sacred_item'
      and transferable
      and locked_by_deal_id is null
    for update
  ) owned;

  if locked_count <> 2 then
    raise exception 'Items are not available for a contract.';
  end if;

  if distinct_rarities <> 1 or input_rarity = 'legendary' or input_rarity = 'system' then
    raise exception 'Items must share a rarity that can be upgraded.';
  end if;

  if p_rarity is distinct from ladder[array_position(ladder, input_rarity) + 1] then
    raise exception 'Result must be of the next rarity.';
  end if;

  if exists (
    select 1 from public.marketplace_listings
    where artifact_id = any (p_artifact_ids) and status in ('draft', 'active', 'reserved')
  ) then
    raise exception 'Items are listed in Market.';
  end if;

  -- Items that were ever part of a listing or deal cannot be deleted; they are retired instead.
  foreach consumed_id in array p_artifact_ids loop
    begin
      delete from public.user_artifacts where id = consumed_id;
    exception when foreign_key_violation then
      update public.user_artifacts
      set transferable = false,
          visibility = 'private',
          metadata = metadata || jsonb_build_object('consumed_at', now(), 'consumed_into', new_artifact_id),
          updated_at = now()
      where id = consumed_id;
    end;
  end loop;

  insert into public.user_artifacts (
    id, user_id, artifact_type, title, description, rarity, visibility, transferable, source_type, metadata
  )
  values (
    new_artifact_id, p_user_id, 'sacred_item', p_title, p_description, p_rarity, 'public', true, 'system',
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('item_key', p_item_key, 'merged_from', to_jsonb(p_artifact_ids))
      || case when coalesce(p_idempotency_key, '') <> '' then jsonb_build_object('merge_key', p_idempotency_key) else '{}'::jsonb end
  );

  return new_artifact_id;
end;
$$;

revoke all on function public.merge_system_items(uuid, uuid[], text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.merge_system_items(uuid, uuid[], text, text, text, text, jsonb, text) to service_role;
