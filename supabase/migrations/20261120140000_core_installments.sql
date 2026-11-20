-- «Взять и купить» под доход Core (Evgen, 2026-11-20; docs/WIR_INTERNAL_CREDIT_PLAN.md, docs/CORE_INSTALLMENT_PLAN.md).
--
-- A buyer who lacks Wallet money for a Marketplace listing may take the shortfall as an installment. The limit is
-- what half of the buyer's daily Core income repays within 360 days, scaled by reputation (0.5..1), minus what is
-- still open, so Core income always repays it without any action. Core itself never decreases.
--
-- Money never appears from nothing and the reserve is never spent ahead:
--   * at purchase the shortfall is credited to the buyer and immediately held in escrow with the rest of the price;
--   * when escrow is released, the seller keeps the part the buyer paid and the installment part is held back;
--   * every night half of the buyer's Core income (after P2P recovery) goes to the seller until the part is repaid;
--   * when escrow is refunded, the shortfall is taken back from the refunded buyer and the installment is cancelled.
-- So the sum of all Wallets moves exactly as it would without installments.

-- 1. Ledger vocabulary -------------------------------------------------------------------------------------------
alter table public.wallet_ledger drop constraint if exists wallet_ledger_operation_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check check (operation_type in (
  'marketplace_escrow_hold', 'marketplace_payment', 'marketplace_refund', 'wallet_transfer', 'wallet_core_topup',
  'challenge_reward', 'crypto_deposit', 'crypto_withdrawal', 'system_adjustment', 'referral_reward',
  'system_shop_purchase', 'internal_turnover_fee', 'team_bonus', 'p2p_escrow_hold', 'p2p_escrow_release',
  'p2p_escrow_refund', 'p2p_compensation', 'p2p_recovery', 'p2p_collateral_hold', 'p2p_collateral_release',
  'word_pledge_hold', 'word_pledge_release',
  'core_installment_advance', 'core_installment_holdback', 'core_installment_cancel', 'core_installment_repayment', 'core_installment_early'
));

alter table public.wallet_ledger drop constraint if exists wallet_ledger_source_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_source_type_check check (source_type in (
  'challenge', 'core_topup', 'marketplace_deal', 'wallet_transfer', 'crypto_deposit', 'crypto_withdrawal', 'p2p_ad',
  'p2p_order', 'p2p_recovery', 'p2p_collateral', 'manual', 'system', 'word_pledge', 'core_installment'
));

-- 2. Tables ------------------------------------------------------------------------------------------------------
create table if not exists public.core_installments (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid not null unique references public.marketplace_deals(id) on delete cascade,
  amount numeric(30, 12) not null check (amount > 0),
  remaining numeric(30, 12) not null check (remaining >= 0),
  -- pending: escrow held; open: seller paid, Core income repays; closed: repaid; cancelled: deal refunded.
  status text not null default 'pending' check (status in ('pending', 'open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  check (remaining <= amount),
  check (buyer_user_id <> seller_user_id)
);
create index if not exists core_installments_buyer_idx on public.core_installments (buyer_user_id, status, created_at);
create index if not exists core_installments_seller_idx on public.core_installments (seller_user_id, status);

create table if not exists public.core_installment_payments (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.core_installments(id) on delete cascade,
  amount numeric(30, 12) not null check (amount > 0),
  source text not null check (source in ('core_accrual', 'early')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists core_installment_payments_installment_idx on public.core_installment_payments (installment_id, created_at);

alter table public.core_installments enable row level security;
alter table public.core_installment_payments enable row level security;
revoke all on public.core_installments from public, anon, authenticated;
revoke all on public.core_installment_payments from public, anon, authenticated;
grant select, insert, update, delete on public.core_installments to service_role;
grant select, insert, update, delete on public.core_installment_payments to service_role;

-- 3. Limit -------------------------------------------------------------------------------------------------------
-- limit = Core × 0.0633% × 50% × 360 × reputation − open remaining, reputation = 0.5 + 0.5 × min(1, completed deals / 10).
create or replace function public.core_installment_limit(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  daily_rate constant numeric := 0.000633;
  repay_share constant numeric := 0.5;
  horizon_days constant numeric := 360;
  v_core numeric := 0;
  v_deals integer := 0;
  v_reputation numeric;
  v_capacity numeric;
  v_open numeric := 0;
  v_human boolean := false;
begin
  select coalesce(balance, 0) into v_core from public.core_accounts where user_id = p_user_id;
  v_core := coalesce(v_core, 0);
  select coalesce(humanity_level, 0) >= 2 into v_human from public.humanity_verifications where user_id = p_user_id;
  v_human := coalesce(v_human, false);
  select count(*) into v_deals from public.marketplace_deals
    where status = 'completed' and (buyer_user_id = p_user_id or seller_user_id = p_user_id);
  v_reputation := 0.5 + 0.5 * least(1, v_deals / 10.0);
  select coalesce(sum(remaining), 0) into v_open from public.core_installments
    where buyer_user_id = p_user_id and status in ('pending', 'open');
  v_capacity := v_core * daily_rate * repay_share * horizon_days;
  return jsonb_build_object(
    'eligible', v_human,
    'reason', case when not v_human then 'humanity_required' else null end,
    'core', v_core,
    'reputation', v_reputation,
    'capacity', round(v_capacity, 2),
    'open', round(v_open, 2),
    'dailyRepayment', round(v_core * daily_rate * repay_share, 6),
    'limit', case when v_human then greatest(0, trunc(v_capacity * v_reputation - v_open, 2)) else 0 end
  );
end;
$$;
revoke all on function public.core_installment_limit(uuid) from public, anon, authenticated;
grant execute on function public.core_installment_limit(uuid) to service_role;

-- 4. Purchase ----------------------------------------------------------------------------------------------------
create or replace function public.create_marketplace_deal_on_installment(
  p_listing_id uuid,
  p_buyer_user_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_shortfall numeric(30, 12);
  v_limit jsonb;
  v_result jsonb;
  v_deal_id uuid;
  v_existing public.core_installments%rowtype;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required.'; end if;
  -- A repeated call returns the deal created before.
  select installment.* into v_existing from public.core_installments installment
    join public.marketplace_deals deal on deal.id = installment.deal_id
    where deal.buyer_user_id = p_buyer_user_id and deal.idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object('deal_id', v_existing.deal_id, 'installment_id', v_existing.id, 'installment_amount', v_existing.amount, 'idempotent', true);
  end if;

  -- The same key used for an ordinary purchase: return that deal, never add an installment to it.
  if exists (select 1 from public.marketplace_deals where buyer_user_id = p_buyer_user_id and idempotency_key = trim(p_idempotency_key)) then
    return public.create_marketplace_deal_with_key(p_listing_id, p_buyer_user_id, p_idempotency_key);
  end if;
  select * into v_listing from public.marketplace_listings where id = p_listing_id;
  if not found then return jsonb_build_object('error', 'Listing not found.'); end if;
  if v_listing.seller_user_id = p_buyer_user_id then return jsonb_build_object('error', 'Cannot buy your own item.'); end if;
  select * into v_wallet from public.wallet_accounts where user_id = p_buyer_user_id for update;
  if not found then return jsonb_build_object('error', 'Buyer wallet not found.'); end if;

  v_shortfall := v_listing.price_amount - greatest(v_wallet.balance, 0);
  if v_shortfall <= 0 then
    -- Enough money: an ordinary purchase.
    return public.create_marketplace_deal_with_key(p_listing_id, p_buyer_user_id, p_idempotency_key);
  end if;
  v_shortfall := ceil(v_shortfall * 100) / 100;

  v_limit := public.core_installment_limit(p_buyer_user_id);
  if not coalesce((v_limit->>'eligible')::boolean, false) then return jsonb_build_object('error', 'Installments open after «Я не робот».', 'code', 'humanity_required'); end if;
  if v_shortfall > (v_limit->>'limit')::numeric then
    return jsonb_build_object('error', 'The installment limit is too small for this purchase.', 'code', 'limit', 'limit', v_limit->'limit', 'shortfall', v_shortfall);
  end if;

  -- The shortfall is credited and immediately held in escrow by the ordinary purchase below.
  update public.wallet_accounts set balance = balance + v_shortfall, updated_at = now() where user_id = p_buyer_user_id;
  v_result := public.create_marketplace_deal_with_key(p_listing_id, p_buyer_user_id, p_idempotency_key);
  if v_result ? 'error' then raise exception '%', v_result->>'error'; end if;
  v_deal_id := (v_result->>'deal_id')::uuid;

  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
  select p_buyer_user_id, 'credit', v_shortfall, v_listing.currency_code, 'core_installment_advance', 'core_installment', v_deal_id, v_listing.seller_user_id,
    wallet.balance, 'core_installment:' || v_deal_id::text || ':advance', jsonb_build_object('deal_id', v_deal_id)
  from public.wallet_accounts wallet where wallet.user_id = p_buyer_user_id;

  insert into public.core_installments (buyer_user_id, seller_user_id, deal_id, amount, remaining)
    values (p_buyer_user_id, v_listing.seller_user_id, v_deal_id, v_shortfall, v_shortfall)
    returning * into v_existing;
  return v_result || jsonb_build_object('installment_id', v_existing.id, 'installment_amount', v_shortfall);
end;
$$;
revoke all on function public.create_marketplace_deal_on_installment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_deal_on_installment(uuid, uuid, text) to service_role;

-- 5. Release and refund ------------------------------------------------------------------------------------------
-- Deferred to commit, so it sees the escrow outcome and the wallet credits of the same transaction in any order.
create or replace function public.settle_core_installment_on_escrow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installment public.core_installments%rowtype;
  v_status text;
  v_balance numeric(30, 12);
begin
  select status into v_status from public.marketplace_escrows where deal_id = new.deal_id;
  select * into v_installment from public.core_installments where deal_id = new.deal_id and status = 'pending' for update;
  if not found or v_status not in ('released', 'refunded') then return null; end if;

  if v_status = 'released' then
    -- The seller keeps what the buyer paid; the installment part comes from the buyer's Core income.
    update public.wallet_accounts set balance = balance - v_installment.amount, updated_at = now()
      where user_id = v_installment.seller_user_id returning balance into v_balance;
    if v_balance < 0 then raise exception 'Seller balance cannot cover the installment holdback.'; end if;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
      values (v_installment.seller_user_id, 'debit', v_installment.amount, '$', 'core_installment_holdback', 'core_installment', v_installment.id, v_installment.buyer_user_id,
        v_balance, 'core_installment:' || v_installment.id::text || ':holdback', jsonb_build_object('deal_id', v_installment.deal_id));
    update public.core_installments set status = 'open', opened_at = now() where id = v_installment.id;
  else
    -- Refund: the buyer got the whole price back, the shortfall goes back to where it came from.
    update public.wallet_accounts set balance = balance - v_installment.amount, updated_at = now()
      where user_id = v_installment.buyer_user_id returning balance into v_balance;
    if v_balance < 0 then raise exception 'Buyer balance cannot cover the cancelled installment.'; end if;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
      values (v_installment.buyer_user_id, 'debit', v_installment.amount, '$', 'core_installment_cancel', 'core_installment', v_installment.id, v_installment.seller_user_id,
        v_balance, 'core_installment:' || v_installment.id::text || ':cancel', jsonb_build_object('deal_id', v_installment.deal_id));
    update public.core_installments set status = 'cancelled', remaining = 0, closed_at = now() where id = v_installment.id;
  end if;
  return null;
end;
$$;

drop trigger if exists core_installment_escrow_settle on public.marketplace_escrows;
create constraint trigger core_installment_escrow_settle
  after insert or update on public.marketplace_escrows
  deferrable initially deferred
  for each row execute function public.settle_core_installment_on_escrow();

-- 6. Repayment ---------------------------------------------------------------------------------------------------
-- Half of what the buyer would receive today goes to the sellers of open installments, oldest first.
create or replace function public.apply_core_installment_repayment(
  p_user_id uuid,
  p_distributable numeric,
  p_idempotency_key text
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap numeric(30, 12);
  v_applied numeric(30, 12);
  v_total numeric(30, 12) := 0;
  v_balance numeric(30, 12);
  v_installment public.core_installments%rowtype;
begin
  if exists (select 1 from public.core_installment_payments where idempotency_key like p_idempotency_key || ':%') then
    select coalesce(sum(amount), 0) into v_total from public.core_installment_payments where idempotency_key like p_idempotency_key || ':%';
    return v_total;
  end if;
  v_cap := round(greatest(coalesce(p_distributable, 0), 0) * 0.5, 12);
  if v_cap <= 0 then return 0; end if;
  for v_installment in
    select * from public.core_installments where buyer_user_id = p_user_id and status = 'open' order by created_at for update
  loop
    exit when v_cap <= 0;
    v_applied := least(v_cap, v_installment.remaining);
    update public.core_installments set remaining = remaining - v_applied,
      status = case when remaining - v_applied <= 0 then 'closed' else status end,
      closed_at = case when remaining - v_applied <= 0 then now() else closed_at end
      where id = v_installment.id;
    insert into public.core_installment_payments (installment_id, amount, source, idempotency_key)
      values (v_installment.id, v_applied, 'core_accrual', p_idempotency_key || ':' || v_installment.id::text);
    update public.wallet_accounts set balance = balance + v_applied, updated_at = now()
      where user_id = v_installment.seller_user_id returning balance into v_balance;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
      values (v_installment.seller_user_id, 'credit', v_applied, '$', 'core_installment_repayment', 'core_installment', v_installment.id, p_user_id,
        v_balance, 'core_installment:' || p_idempotency_key || ':' || v_installment.id::text, jsonb_build_object('deal_id', v_installment.deal_id));
    v_cap := v_cap - v_applied;
    v_total := v_total + v_applied;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.apply_core_installment_repayment(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.apply_core_installment_repayment(uuid, numeric, text) to service_role;

-- Early repayment from the buyer's own Wallet, any amount, no fee.
create or replace function public.repay_core_installments_early(p_user_id uuid, p_amount numeric, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left numeric(30, 12);
  v_applied numeric(30, 12);
  v_total numeric(30, 12) := 0;
  v_buyer numeric(30, 12);
  v_seller numeric(30, 12);
  v_installment public.core_installments%rowtype;
begin
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('error', 'Enter a positive amount.'); end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required.'; end if;
  if exists (select 1 from public.core_installment_payments where idempotency_key like 'early:' || p_user_id::text || ':' || trim(p_idempotency_key) || ':%') then
    return jsonb_build_object('idempotent', true);
  end if;
  select balance into v_buyer from public.wallet_accounts where user_id = p_user_id for update;
  v_left := least(p_amount, coalesce(v_buyer, 0));
  for v_installment in
    select * from public.core_installments where buyer_user_id = p_user_id and status = 'open' order by created_at for update
  loop
    exit when v_left <= 0;
    v_applied := least(v_left, v_installment.remaining);
    update public.core_installments set remaining = remaining - v_applied,
      status = case when remaining - v_applied <= 0 then 'closed' else status end,
      closed_at = case when remaining - v_applied <= 0 then now() else closed_at end
      where id = v_installment.id;
    insert into public.core_installment_payments (installment_id, amount, source, idempotency_key)
      values (v_installment.id, v_applied, 'early', 'early:' || p_user_id::text || ':' || trim(p_idempotency_key) || ':' || v_installment.id::text);
    update public.wallet_accounts set balance = balance - v_applied, updated_at = now() where user_id = p_user_id returning balance into v_buyer;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
      values (p_user_id, 'debit', v_applied, '$', 'core_installment_early', 'core_installment', v_installment.id, v_installment.seller_user_id,
        v_buyer, 'core_installment:early:' || trim(p_idempotency_key) || ':' || v_installment.id::text || ':buyer', jsonb_build_object('deal_id', v_installment.deal_id));
    update public.wallet_accounts set balance = balance + v_applied, updated_at = now() where user_id = v_installment.seller_user_id returning balance into v_seller;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
      values (v_installment.seller_user_id, 'credit', v_applied, '$', 'core_installment_repayment', 'core_installment', v_installment.id, p_user_id,
        v_seller, 'core_installment:early:' || trim(p_idempotency_key) || ':' || v_installment.id::text || ':seller', jsonb_build_object('deal_id', v_installment.deal_id));
    v_left := v_left - v_applied;
    v_total := v_total + v_applied;
  end loop;
  return jsonb_build_object('repaid', v_total);
end;
$$;
revoke all on function public.repay_core_installments_early(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.repay_core_installments_early(uuid, numeric, text) to service_role;

-- 7. Nightly accrual: same as 20260915181558, plus the installment share after P2P recovery -----------------------
alter table public.daily_core_accruals add column if not exists installment_amount numeric(30, 12) not null default 0 check (installment_amount >= 0);

create or replace function public.run_daily_core_accrual(
  p_accrual_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account record;
  daily_rate constant numeric(12, 10) := 0.0006330000;
  gross_amount numeric(30, 12);
  distributable_amount numeric(30, 12);
  recovery_amount numeric(30, 12);
  recovery_result jsonb;
  installment_amount numeric(30, 12);
  core_amount numeric(30, 12);
  wallet_amount numeric(30, 12);
  obligation_id uuid;
  inserted boolean;
begin
  perform public.refresh_core_emission_safety();
  if exists (select 1 from public.core_redemption_controls where id = true and system_emissions_paused) then return; end if;
  for account in
    select core.user_id, core.balance, core.reinvest_percent
    from public.core_accounts core
    where not exists (
      select 1 from public.core_redemption_requests request
      where request.user_id = core.user_id and request.status in ('requested', 'reserved', 'processing', 'paid', 'failed')
    )
    order by core.user_id
  loop
    if exists (select 1 from public.daily_core_accruals existing where existing.accrual_date = p_accrual_date and existing.user_id = account.user_id) then continue; end if;
    gross_amount := round(account.balance * daily_rate, 12);
    recovery_result := public.p2p_apply_core_recovery(account.user_id, gross_amount, 'daily-core:' || p_accrual_date::text || ':' || account.user_id::text);
    recovery_amount := round(coalesce((recovery_result->>'withheldAmount')::numeric, 0), 12);
    distributable_amount := gross_amount - recovery_amount;
    installment_amount := public.apply_core_installment_repayment(account.user_id, distributable_amount, 'daily-core:' || p_accrual_date::text || ':' || account.user_id::text);
    distributable_amount := distributable_amount - installment_amount;
    core_amount := round(distributable_amount * (account.reinvest_percent / 100), 12);
    wallet_amount := distributable_amount - core_amount;

    insert into public.core_accrual_obligations (
      accrual_date, user_id, core_before, daily_rate, expected_gross_amount,
      expected_core_amount, expected_wallet_amount, expected_p2p_recovery_amount
    ) values (
      p_accrual_date, account.user_id, account.balance, daily_rate, gross_amount,
      core_amount, wallet_amount, recovery_amount
    )
    on conflict (accrual_date, user_id) do nothing;
    select id into obligation_id from public.core_accrual_obligations where accrual_date = p_accrual_date and user_id = account.user_id;

    inserted := false;
    insert into public.daily_core_accruals (
      accrual_date, user_id, core_before, daily_rate, gross_amount, reinvest_percent,
      core_amount, wallet_amount, core_after, obligation_id, p2p_recovery_amount, installment_amount
    ) values (
      p_accrual_date, account.user_id, account.balance, daily_rate, gross_amount, account.reinvest_percent,
      core_amount, wallet_amount, account.balance + core_amount, obligation_id, recovery_amount, installment_amount
    )
    on conflict (accrual_date, user_id) do nothing returning true into inserted;

    if coalesce(inserted, false) then
      update public.core_accrual_obligations set status = case when status = 'breached' then status else 'settled' end,
        settled_at = coalesce(settled_at, now()), updated_at = now() where id = obligation_id;
      if core_amount > 0 then update public.core_accounts set balance = balance + core_amount, updated_at = now() where user_id = account.user_id; end if;
      if wallet_amount > 0 then update public.wallet_accounts set balance = balance + wallet_amount, updated_at = now() where user_id = account.user_id; end if;
    end if;
  end loop;
end;
$$;
