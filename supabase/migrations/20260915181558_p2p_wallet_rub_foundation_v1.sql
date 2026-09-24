-- Closed-pilot Wallet <-> RUB P2P foundation. All money-changing RPCs are
-- service-role only; the application authenticates the actor before calling.

create table public.p2p_risk_configs (
  version text primary key,
  is_active boolean not null default false,
  beginner_unsecured_limit numeric(20, 2) not null check (beginner_unsecured_limit >= 0),
  core_horizon_days integer not null check (core_horizon_days > 0),
  core_daily_rate numeric(12, 10) not null check (core_daily_rate >= 0),
  core_coverage_percent numeric(5, 2) not null check (core_coverage_percent between 0 and 100),
  core_recovery_percent numeric(5, 2) not null check (core_recovery_percent between 0 and 100),
  coverage_days integer not null check (coverage_days > 0),
  max_concurrent_orders integer not null check (max_concurrent_orders > 0),
  max_order_amount numeric(20, 2) not null check (max_order_amount > 0),
  rolling_24h_limit numeric(20, 2) not null check (rolling_24h_limit > 0),
  payment_minutes integer not null check (payment_minutes > 0),
  receipt_confirmation_minutes integer not null check (receipt_confirmation_minutes > 0),
  pilot_fee_percent numeric(5, 2) not null check (pilot_fee_percent between 0 and 100),
  matured_orders_required integer not null check (matured_orders_required >= 0),
  trust_enforcement_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index p2p_risk_configs_one_active_idx on public.p2p_risk_configs (is_active) where is_active;

insert into public.p2p_risk_configs (
  version, is_active, beginner_unsecured_limit, core_horizon_days, core_daily_rate,
  core_coverage_percent, core_recovery_percent, coverage_days, max_concurrent_orders,
  max_order_amount, rolling_24h_limit, payment_minutes, receipt_confirmation_minutes,
  pilot_fee_percent, matured_orders_required, trust_enforcement_enabled
) values (
  'p2p-pilot-v1', true, 100, 365, 0.0006330000, 50, 50, 7, 1,
  1000, 2000, 15, 30, 0, 3, false
);

create table public.p2p_trust_tiers (
  config_version text not null references public.p2p_risk_configs(version) on delete restrict,
  tier_order integer not null check (tier_order > 0),
  minimum_score numeric(20, 4) not null,
  maximum_score numeric(20, 4),
  factor numeric(5, 2) not null check (factor between 0 and 1),
  primary key (config_version, tier_order),
  check (maximum_score is null or maximum_score > minimum_score)
);
insert into public.p2p_trust_tiers (config_version, tier_order, minimum_score, maximum_score, factor)
values
  ('p2p-pilot-v1', 1, 0, 1, 0.5),
  ('p2p-pilot-v1', 2, 1, 5, 0.75),
  ('p2p-pilot-v1', 3, 5, null, 1);

create table public.p2p_pilot_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'suspended', 'revoked')),
  verified_name text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.p2p_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method_type text not null check (method_type in ('sbp', 'bank_transfer')),
  label text not null check (char_length(label) between 1 and 100),
  masked_details text not null check (char_length(masked_details) between 1 and 160),
  encrypted_payload text not null,
  encryption_iv text not null,
  encryption_tag text not null,
  key_version text not null default 'v1',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.p2p_fund_accounts (
  id boolean primary key default true check (id),
  wallet_balance numeric(20, 2) not null default 0 check (wallet_balance >= 0),
  reserved_amount numeric(20, 2) not null default 0 check (reserved_amount >= 0 and reserved_amount <= wallet_balance),
  externally_verified_at timestamptz,
  verification_reference text,
  updated_at timestamptz not null default now()
);
insert into public.p2p_fund_accounts (id) values (true);

create table public.p2p_wallet_collateral (
  user_id uuid primary key references auth.users(id) on delete cascade,
  amount numeric(20, 2) not null default 0 check (amount >= 0),
  reserved_amount numeric(20, 2) not null default 0 check (reserved_amount >= 0 and reserved_amount <= amount),
  updated_at timestamptz not null default now()
);

create table public.p2p_ads (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  payment_method_id uuid not null references public.p2p_payment_methods(id) on delete restrict,
  wallet_amount numeric(20, 2) not null check (wallet_amount > 0),
  available_amount numeric(20, 2) not null check (available_amount >= 0 and available_amount <= wallet_amount),
  rub_per_wallet numeric(20, 4) not null check (rub_per_wallet > 0),
  min_wallet_amount numeric(20, 2) not null check (min_wallet_amount > 0),
  max_wallet_amount numeric(20, 2) not null check (max_wallet_amount >= min_wallet_amount),
  core_recovery_accepted_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed', 'cancelled')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.p2p_orders (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.p2p_ads(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  payment_method_id uuid not null references public.p2p_payment_methods(id) on delete restrict,
  config_version text not null references public.p2p_risk_configs(version) on delete restrict,
  wallet_amount numeric(20, 2) not null check (wallet_amount > 0),
  rub_amount numeric(20, 2) not null check (rub_amount > 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'payment_marked', 'review_required', 'released', 'disputed', 'resolved', 'settled', 'cancelled')),
  payment_due_at timestamptz not null,
  receipt_confirmation_due_at timestamptz,
  coverage_until timestamptz,
  payment_marked_at timestamptz,
  released_at timestamptz,
  resolved_at timestamptz,
  fund_reserved_amount numeric(20, 2) not null check (fund_reserved_amount >= 0),
  terms_snapshot jsonb not null check (jsonb_typeof(terms_snapshot) = 'object'),
  payment_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(payment_evidence) = 'object'),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_user_id <> seller_user_id)
);

create table public.p2p_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.p2p_orders(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('buyer', 'seller', 'operator', 'system')),
  event_type text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.p2p_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.p2p_orders(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 1 and 2000),
  is_late boolean not null default false,
  appeal_reason text,
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'appealed', 'corrected')),
  resolution text,
  resolution_reason text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.p2p_fund_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.p2p_orders(id) on delete restrict,
  operation_type text not null check (operation_type in ('funding', 'reserve', 'release', 'compensation', 'correction')),
  amount numeric(20, 2) not null check (amount > 0),
  balance_after numeric(20, 2) not null check (balance_after >= 0),
  reserved_after numeric(20, 2) not null check (reserved_after >= 0 and reserved_after <= balance_after),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.p2p_recovery_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.p2p_orders(id) on delete restrict,
  debtor_user_id uuid not null references auth.users(id) on delete restrict,
  original_amount numeric(20, 2) not null check (original_amount > 0),
  outstanding_amount numeric(20, 2) not null check (outstanding_amount >= 0),
  status text not null default 'active' check (status in ('active', 'repaid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, debtor_user_id)
);

create table public.p2p_recovery_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.p2p_recovery_claims(id) on delete restrict,
  amount numeric(20, 12) not null,
  event_type text not null check (event_type in ('core_accrual_withheld', 'wallet_collateral_used', 'correction')),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.p2p_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blocked boolean not null default false,
  reason text,
  source_dispute_id uuid references public.p2p_disputes(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.p2p_trust_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  dispute_id uuid not null references public.p2p_disputes(id) on delete restrict,
  event_type text not null check (event_type in ('confirmed_harm', 'confirmed_fraud', 'correction')),
  delta numeric(20, 4) not null,
  reverses_event_id uuid references public.p2p_trust_events(id) on delete restrict,
  idempotency_key text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);

create index p2p_ads_active_idx on public.p2p_ads (created_at desc) where status = 'active';
create index p2p_orders_buyer_created_idx on public.p2p_orders (buyer_user_id, created_at desc);
create index p2p_orders_seller_created_idx on public.p2p_orders (seller_user_id, created_at desc);
create index p2p_orders_status_due_idx on public.p2p_orders (status, payment_due_at, receipt_confirmation_due_at);
create index p2p_orders_coverage_idx on public.p2p_orders (coverage_until) where status = 'released';
create index p2p_order_events_order_created_idx on public.p2p_order_events (order_id, created_at);
create index p2p_recovery_claims_debtor_idx on public.p2p_recovery_claims (debtor_user_id) where status = 'active';

alter table public.p2p_risk_configs enable row level security;
alter table public.p2p_trust_tiers enable row level security;
alter table public.p2p_pilot_members enable row level security;
alter table public.p2p_payment_methods enable row level security;
alter table public.p2p_fund_accounts enable row level security;
alter table public.p2p_wallet_collateral enable row level security;
alter table public.p2p_ads enable row level security;
alter table public.p2p_orders enable row level security;
alter table public.p2p_order_events enable row level security;
alter table public.p2p_disputes enable row level security;
alter table public.p2p_fund_ledger enable row level security;
alter table public.p2p_recovery_claims enable row level security;
alter table public.p2p_recovery_events enable row level security;
alter table public.p2p_restrictions enable row level security;
alter table public.p2p_trust_events enable row level security;

revoke all on public.p2p_risk_configs, public.p2p_trust_tiers, public.p2p_pilot_members, public.p2p_payment_methods,
  public.p2p_fund_accounts, public.p2p_wallet_collateral, public.p2p_ads, public.p2p_orders,
  public.p2p_order_events, public.p2p_disputes, public.p2p_fund_ledger,
  public.p2p_recovery_claims, public.p2p_recovery_events, public.p2p_restrictions,
  public.p2p_trust_events
from anon, authenticated;

alter table public.wallet_ledger drop constraint if exists wallet_ledger_operation_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check check (operation_type in (
  'marketplace_escrow_hold', 'marketplace_payment', 'marketplace_refund', 'wallet_transfer',
  'wallet_core_topup', 'challenge_reward', 'crypto_deposit', 'crypto_withdrawal', 'system_adjustment',
  'p2p_escrow_hold', 'p2p_escrow_release', 'p2p_escrow_refund', 'p2p_compensation', 'p2p_recovery',
  'p2p_collateral_hold', 'p2p_collateral_release'
));
alter table public.wallet_ledger drop constraint if exists wallet_ledger_source_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_source_type_check check (source_type in (
  'challenge', 'core_topup', 'marketplace_deal', 'wallet_transfer', 'crypto_deposit',
  'crypto_withdrawal', 'p2p_ad', 'p2p_order', 'p2p_recovery', 'p2p_collateral', 'manual', 'system'
));

create or replace function public.p2p_available_limit(p_user_id uuid, p_role text default 'buyer')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  core_balance numeric := 0;
  core_security numeric := 0;
  collateral_free numeric := 0;
  reserved_trade_principal numeric := 0;
  outstanding numeric := 0;
  turnover numeric := 0;
  matured_counterparties integer := 0;
  active_orders integer := 0;
  trust_score numeric := 0;
  trust_adjustment numeric := 0;
  trust_factor numeric := 1;
  growth_unlocked boolean := false;
  personal_limit numeric := 0;
  secured_capacity numeric := 0;
  available numeric := 0;
  member_status text;
  is_blocked boolean := false;
begin
  select * into config from public.p2p_risk_configs where is_active limit 1;
  if not found then raise exception 'Active P2P risk configuration is missing.'; end if;
  select status into member_status from public.p2p_pilot_members where user_id = p_user_id;
  select coalesce(restriction.blocked, false) into is_blocked from public.p2p_restrictions restriction where restriction.user_id = p_user_id;
  is_blocked := coalesce(is_blocked, false);
  select coalesce((select balance from public.core_accounts where user_id = p_user_id), 0) into core_balance;
  core_security := round(core_balance * config.core_daily_rate * config.core_horizon_days * config.core_coverage_percent / 100, 2);
  select coalesce((select amount - reserved_amount from public.p2p_wallet_collateral where user_id = p_user_id), 0) into collateral_free;
  select coalesce(sum(available_amount), 0) into reserved_trade_principal from public.p2p_ads where seller_user_id = p_user_id and status in ('active', 'closed');
  select coalesce(sum(wallet_amount), 0) into outstanding
  from public.p2p_orders
  where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
    and (status in ('awaiting_payment', 'payment_marked', 'review_required', 'disputed')
      or (status = 'released' and coverage_until > now()));
  select coalesce(sum(wallet_amount), 0) into turnover
  from public.p2p_orders
  where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
    and created_at > now() - interval '24 hours'
    and status <> 'cancelled';
  select count(distinct case when buyer_user_id = p_user_id then seller_user_id else buyer_user_id end)
    into matured_counterparties
  from public.p2p_orders
  where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
    and status = 'settled'
    and coverage_until <= now();
  select count(*) into active_orders
  from public.p2p_orders
  where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
    and status in ('awaiting_payment', 'payment_marked', 'review_required', 'disputed');
  select summary.raw_score into trust_score
  from public.trust_v2_shadow_summaries summary
  where summary.user_id = p_user_id
  order by summary.as_of_date desc, summary.config_version desc
  limit 1;
  trust_score := coalesce(trust_score, 0);
  select coalesce(sum(delta), 0) into trust_adjustment
  from public.p2p_trust_events
  where user_id = p_user_id;
  trust_score := trust_score + trust_adjustment;
  if trust_score <= 0 then
    trust_factor := 0;
  else
    select tier.factor into trust_factor
    from public.p2p_trust_tiers tier
    where tier.config_version = config.version
      and trust_score >= tier.minimum_score
      and (tier.maximum_score is null or trust_score < tier.maximum_score)
    order by tier.tier_order
    limit 1;
    trust_factor := coalesce(trust_factor, 0);
  end if;
  growth_unlocked := matured_counterparties >= config.matured_orders_required;
  secured_capacity := (collateral_free + core_security) * case when config.trust_enforcement_enabled then trust_factor else 1 end;
  personal_limit := case
    when p_role = 'seller' then greatest(0, reserved_trade_principal + secured_capacity - outstanding)
    when not growth_unlocked then greatest(0, config.beginner_unsecured_limit - outstanding)
    else greatest(0, config.beginner_unsecured_limit + secured_capacity - outstanding)
  end;
  available := least(config.max_order_amount, greatest(0, config.rolling_24h_limit - turnover), personal_limit);
  if member_status is distinct from 'active' or is_blocked or active_orders >= config.max_concurrent_orders or (config.trust_enforcement_enabled and trust_factor = 0) then available := 0; end if;
  return jsonb_build_object(
    'configVersion', config.version,
    'availableAmount', round(available, 2),
    'memberStatus', coalesce(member_status, 'not_invited'),
    'blocked', is_blocked,
    'activeOrders', active_orders,
    'outstandingRisk', round(outstanding, 2),
    'rolling24hTurnover', round(turnover, 2),
    'maturedCounterparties', matured_counterparties,
    'growthUnlocked', growth_unlocked,
    'coreSecurity', core_security,
    'freeCollateral', collateral_free,
    'reservedTradePrincipal', reserved_trade_principal,
    'role', p_role,
    'trustScore', trust_score,
    'trustFactor', trust_factor,
    'trustEnforced', config.trust_enforcement_enabled
  );
end;
$$;

create or replace function public.p2p_change_collateral(
  p_user_id uuid,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wallet public.wallet_accounts%rowtype;
  collateral public.p2p_wallet_collateral%rowtype;
  next_balance numeric;
begin
  if p_amount is null or p_amount = 0 or p_amount <> round(p_amount, 2) then raise exception 'Invalid collateral amount.'; end if;
  perform 1 from public.p2p_pilot_members where user_id = p_user_id for update;
  select * into wallet from public.wallet_accounts where user_id = p_user_id for update;
  if not found then raise exception 'Wallet account is missing.'; end if;
  insert into public.p2p_wallet_collateral (user_id) values (p_user_id) on conflict do nothing;
  select * into collateral from public.p2p_wallet_collateral where user_id = p_user_id for update;
  if exists (select 1 from public.wallet_ledger where idempotency_key = p_idempotency_key and user_id = p_user_id and source_type = 'p2p_collateral') then
    return to_jsonb(collateral);
  end if;
  if p_amount > 0 then
    if not exists (select 1 from public.p2p_pilot_members where user_id = p_user_id and status = 'active') then raise exception 'P2P pilot access is required.'; end if;
    if wallet.balance < p_amount then raise exception 'Insufficient Wallet balance.'; end if;
  else
    if collateral.amount + p_amount < 0 then raise exception 'Insufficient collateral.'; end if;
    -- A conservative lock: any open or still-covered deal keeps the entire
    -- pledge unavailable for withdrawal, including any unused portion.
    if exists (select 1 from public.p2p_orders where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
      and (status in ('awaiting_payment', 'payment_marked', 'review_required', 'disputed')
        or (status = 'released' and coverage_until > now())))
      or exists (select 1 from public.p2p_recovery_claims where debtor_user_id = p_user_id and status = 'active')
    then raise exception 'Collateral is locked by P2P coverage or recovery.'; end if;
  end if;
  next_balance := wallet.balance - p_amount;
  update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_user_id;
  update public.p2p_wallet_collateral set amount = amount + p_amount, updated_at = now() where user_id = p_user_id returning * into collateral;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (p_user_id, case when p_amount > 0 then 'debit' else 'credit' end, abs(p_amount), '$',
    case when p_amount > 0 then 'p2p_collateral_hold' else 'p2p_collateral_release' end,
    'p2p_collateral', p_user_id, next_balance, p_idempotency_key, '{}'::jsonb);
  return to_jsonb(collateral);
end;
$$;

create or replace function public.p2p_create_sell_ad(
  p_seller_user_id uuid,
  p_payment_method_id uuid,
  p_wallet_amount numeric,
  p_rub_per_wallet numeric,
  p_min_wallet_amount numeric,
  p_max_wallet_amount numeric,
  p_accept_core_recovery boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  wallet public.wallet_accounts%rowtype;
  existing public.p2p_ads%rowtype;
  created_ad public.p2p_ads%rowtype;
  next_balance numeric;
begin
  select * into existing from public.p2p_ads where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(existing); end if;
  select * into config from public.p2p_risk_configs where is_active limit 1;
  if not exists (select 1 from public.p2p_pilot_members where user_id = p_seller_user_id and status = 'active') then raise exception 'P2P pilot access is required.'; end if;
  if not exists (select 1 from public.p2p_payment_methods where id = p_payment_method_id and user_id = p_seller_user_id and is_active) then raise exception 'Active own payment method is required.'; end if;
  if p_accept_core_recovery is distinct from true then raise exception 'Core recovery terms must be accepted.'; end if;
  if p_wallet_amount <= 0 or p_wallet_amount > config.max_order_amount or p_wallet_amount <> round(p_wallet_amount, 2) then raise exception 'Invalid Wallet amount.'; end if;
  if p_min_wallet_amount <= 0 or p_max_wallet_amount < p_min_wallet_amount or p_max_wallet_amount > p_wallet_amount then raise exception 'Invalid order range.'; end if;
  if p_rub_per_wallet <= 0 or p_rub_per_wallet <> round(p_rub_per_wallet, 4) then raise exception 'Invalid RUB rate.'; end if;
  select * into wallet from public.wallet_accounts where user_id = p_seller_user_id for update;
  if not found or wallet.balance < p_wallet_amount then raise exception 'Insufficient Wallet balance.'; end if;
  next_balance := wallet.balance - p_wallet_amount;
  update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_seller_user_id;
  insert into public.p2p_ads (seller_user_id, payment_method_id, wallet_amount, available_amount, rub_per_wallet, min_wallet_amount, max_wallet_amount, core_recovery_accepted_at, idempotency_key)
  values (p_seller_user_id, p_payment_method_id, p_wallet_amount, p_wallet_amount, p_rub_per_wallet, p_min_wallet_amount, p_max_wallet_amount, now(), p_idempotency_key)
  returning * into created_ad;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (p_seller_user_id, 'debit', p_wallet_amount, '$', 'p2p_escrow_hold', 'p2p_ad', created_ad.id, next_balance, 'p2p-ad-hold:' || created_ad.id, jsonb_build_object('ad_id', created_ad.id));
  return to_jsonb(created_ad);
end;
$$;

create or replace function public.p2p_create_order(
  p_buyer_user_id uuid,
  p_ad_id uuid,
  p_wallet_amount numeric,
  p_accept_core_recovery boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  ad public.p2p_ads%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  created_order public.p2p_orders%rowtype;
  buyer_limit jsonb;
  seller_limit jsonb;
  terms jsonb;
begin
  select * into created_order from public.p2p_orders where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(created_order); end if;
  select * into config from public.p2p_risk_configs where is_active limit 1;
  select * into ad from public.p2p_ads where id = p_ad_id for update;
  if not found or ad.status <> 'active' then raise exception 'P2P ad is unavailable.'; end if;
  if p_buyer_user_id = ad.seller_user_id then raise exception 'Cannot trade with yourself.'; end if;
  if p_accept_core_recovery is distinct from true then raise exception 'Core recovery terms must be accepted.'; end if;
  -- Lock both participant rows in a stable order. Separate ad locks alone would
  -- allow concurrent orders on different ads to pass the one-order limit.
  perform 1 from public.p2p_pilot_members
  where user_id in (p_buyer_user_id, ad.seller_user_id)
  order by user_id
  for update;
  if p_wallet_amount <> round(p_wallet_amount, 2) or p_wallet_amount < ad.min_wallet_amount or p_wallet_amount > least(ad.max_wallet_amount, ad.available_amount) then raise exception 'Order amount is outside the ad range.'; end if;
  buyer_limit := public.p2p_available_limit(p_buyer_user_id);
  seller_limit := public.p2p_available_limit(ad.seller_user_id, 'seller');
  if (buyer_limit->>'availableAmount')::numeric < p_wallet_amount or (seller_limit->>'availableAmount')::numeric < p_wallet_amount then raise exception 'P2P risk limit is insufficient.'; end if;
  select * into fund from public.p2p_fund_accounts where id for update;
  if fund.externally_verified_at is null or fund.wallet_balance - fund.reserved_amount < p_wallet_amount then raise exception 'Compensation fund coverage is insufficient.'; end if;
  terms := jsonb_build_object(
    'beginnerUnsecuredLimit', config.beginner_unsecured_limit, 'coreHorizonDays', config.core_horizon_days,
    'coreDailyRate', config.core_daily_rate, 'coreCoveragePercent', config.core_coverage_percent,
    'coreRecoveryPercent', config.core_recovery_percent, 'maturedOrdersRequired', config.matured_orders_required,
    'coverageDays', config.coverage_days, 'maxConcurrentOrders', config.max_concurrent_orders,
    'maxOrderAmount', config.max_order_amount, 'rolling24hLimit', config.rolling_24h_limit,
    'paymentMinutes', config.payment_minutes, 'receiptConfirmationMinutes', config.receipt_confirmation_minutes,
    'pilotFeePercent', config.pilot_fee_percent, 'trustEnforced', config.trust_enforcement_enabled,
    'buyerAcceptedCoreRecoveryAt', now(), 'sellerAcceptedCoreRecoveryAt', ad.core_recovery_accepted_at,
    'rubPerWallet', ad.rub_per_wallet, 'paymentMethodId', ad.payment_method_id,
    'buyerLimit', buyer_limit, 'sellerLimit', seller_limit
  );
  update public.p2p_ads set available_amount = available_amount - p_wallet_amount, updated_at = now(),
    status = case when available_amount - p_wallet_amount = 0 then 'closed' else status end where id = ad.id;
  update public.p2p_fund_accounts set reserved_amount = reserved_amount + p_wallet_amount, updated_at = now() where id;
  insert into public.p2p_orders (ad_id, buyer_user_id, seller_user_id, payment_method_id, config_version, wallet_amount, rub_amount, payment_due_at, fund_reserved_amount, terms_snapshot, idempotency_key)
  values (ad.id, p_buyer_user_id, ad.seller_user_id, ad.payment_method_id, config.version, p_wallet_amount, round(p_wallet_amount * ad.rub_per_wallet, 2), now() + make_interval(mins => config.payment_minutes), p_wallet_amount, terms, p_idempotency_key)
  returning * into created_order;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (created_order.id, p_buyer_user_id, 'buyer', 'created', 'p2p-order-created:' || created_order.id, jsonb_build_object('terms', terms));
  insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
  values (created_order.id, 'reserve', p_wallet_amount, fund.wallet_balance, fund.reserved_amount + p_wallet_amount, 'p2p-fund-reserve:' || created_order.id);
  perform public.create_notification_event('p2p.order.created', 'deals', 'p2p_order', created_order.id::text, 'P2P order created', 'Open the order to see the next step.', '/?view=wallet.p2p', array[p_buyer_user_id, ad.seller_user_id], 'p2p-order-created:' || created_order.id, '{}'::jsonb);
  return to_jsonb(created_order);
end;
$$;

create or replace function public.p2p_order_action(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_idempotency_key text,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  target public.p2p_orders%rowtype;
  ad public.p2p_ads%rowtype;
  buyer_wallet public.wallet_accounts%rowtype;
  next_balance numeric;
  actor_kind text;
begin
  select * into target from public.p2p_orders where id = p_order_id for update;
  if not found or p_actor_user_id not in (target.buyer_user_id, target.seller_user_id) then raise exception 'P2P order access denied.'; end if;
  if exists (select 1 from public.p2p_order_events where idempotency_key = p_idempotency_key and order_id = p_order_id and actor_user_id = p_actor_user_id and event_type = p_action) then return to_jsonb(target); end if;
  actor_kind := case when p_actor_user_id = target.buyer_user_id then 'buyer' else 'seller' end;
  select * into config from public.p2p_risk_configs where version = target.config_version;
  if p_action = 'mark_paid' then
    if actor_kind <> 'buyer' or target.status <> 'awaiting_payment' or target.payment_due_at < now() then raise exception 'Order cannot be marked paid.'; end if;
    update public.p2p_orders set status = 'payment_marked', payment_marked_at = now(), receipt_confirmation_due_at = now() + make_interval(mins => config.receipt_confirmation_minutes), payment_evidence = coalesce(p_evidence, '{}'::jsonb), updated_at = now() where id = target.id returning * into target;
  elsif p_action = 'confirm_received' then
    if actor_kind <> 'seller' or target.status not in ('payment_marked', 'review_required') then raise exception 'Receipt cannot be confirmed.'; end if;
    select * into buyer_wallet from public.wallet_accounts where user_id = target.buyer_user_id for update;
    if not found then raise exception 'Buyer Wallet is missing.'; end if;
    next_balance := buyer_wallet.balance + target.wallet_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = target.buyer_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
    values (target.buyer_user_id, 'credit', target.wallet_amount, '$', 'p2p_escrow_release', 'p2p_order', target.id, target.seller_user_id, next_balance, 'p2p-order-release:' || target.id, jsonb_build_object('order_id', target.id));
    update public.p2p_orders set status = 'released', released_at = now(), coverage_until = now() + make_interval(days => config.coverage_days), updated_at = now() where id = target.id returning * into target;
  elsif p_action = 'cancel' then
    if actor_kind <> 'buyer' or target.status <> 'awaiting_payment' then raise exception 'Only the buyer can cancel an unpaid order.'; end if;
    select * into ad from public.p2p_ads where id = target.ad_id for update;
    update public.p2p_ads set available_amount = available_amount + target.wallet_amount, status = case when status = 'closed' then 'active' else status end, updated_at = now() where id = ad.id;
    update public.p2p_fund_accounts set reserved_amount = reserved_amount - target.fund_reserved_amount, updated_at = now() where id;
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
    select target.id, 'release', target.fund_reserved_amount, wallet_balance, reserved_amount, 'p2p-fund-cancel:' || target.id from public.p2p_fund_accounts where id;
    update public.p2p_orders set status = 'cancelled', fund_reserved_amount = 0, updated_at = now() where id = target.id returning * into target;
  elsif p_action = 'open_dispute' then
    if target.status not in ('payment_marked', 'review_required', 'released', 'settled')
      or (target.status = 'released' and target.coverage_until < now()) then raise exception 'Order is outside the dispute window.'; end if;
    if exists (select 1 from public.p2p_disputes where order_id = target.id) then raise exception 'This order already has a dispute; request an appeal from the operator.'; end if;
    if nullif(btrim(p_evidence->>'reason'), '') is null then raise exception 'Dispute reason is required.'; end if;
    insert into public.p2p_disputes (order_id, opened_by, reason, is_late)
    values (target.id, p_actor_user_id, left(p_evidence->>'reason', 2000), target.status = 'settled');
    update public.p2p_orders set status = 'disputed', updated_at = now() where id = target.id returning * into target;
  elsif p_action = 'appeal' then
    if nullif(btrim(p_evidence->>'reason'), '') is null then raise exception 'Appeal reason is required.'; end if;
    update public.p2p_disputes set status = 'appealed', appeal_reason = left(p_evidence->>'reason', 2000), updated_at = now()
    where order_id = target.id and status = 'resolved' and resolved_at >= now() - interval '7 days';
    if not found then raise exception 'Resolved dispute is outside the appeal window.'; end if;
  else raise exception 'Unsupported P2P order action.';
  end if;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (target.id, p_actor_user_id, actor_kind, p_action, p_idempotency_key, coalesce(p_evidence, '{}'::jsonb));
  perform public.create_notification_event('p2p.order.' || p_action, case when p_action = 'open_dispute' then 'disputes' else 'deals' end, 'p2p_order', target.id::text, 'P2P order updated', 'Open the order to see its current status.', '/?view=wallet.p2p', array[target.buyer_user_id, target.seller_user_id], 'p2p-action:' || p_idempotency_key, '{}'::jsonb);
  return to_jsonb(target);
end;
$$;

create or replace function public.p2p_process_timers(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.p2p_orders%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  expired_count integer := 0;
  review_count integer := 0;
  settled_count integer := 0;
begin
  for target in select * from public.p2p_orders where status = 'awaiting_payment' and payment_due_at <= now() order by payment_due_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    update public.p2p_ads set available_amount = available_amount + target.wallet_amount, status = case when status = 'closed' then 'active' else status end, updated_at = now() where id = target.ad_id;
    update public.p2p_fund_accounts set reserved_amount = reserved_amount - target.fund_reserved_amount, updated_at = now() where id returning * into fund;
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
    values (target.id, 'release', target.fund_reserved_amount, fund.wallet_balance, fund.reserved_amount, 'p2p-fund-payment-timeout:' || target.id);
    update public.p2p_orders set status = 'cancelled', fund_reserved_amount = 0, updated_at = now() where id = target.id;
    insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key) values (target.id, 'system', 'payment_timeout_cancelled', 'p2p-payment-timeout:' || target.id) on conflict do nothing;
    perform public.create_notification_event('p2p.order.payment_timeout', 'deals', 'p2p_order', target.id::text, 'P2P order updated', 'Payment time expired. Open the order for details.', '/?view=wallet.p2p', array[target.buyer_user_id, target.seller_user_id], 'p2p-payment-timeout:' || target.id, '{}'::jsonb);
    expired_count := expired_count + 1;
  end loop;
  for target in select * from public.p2p_orders where status = 'payment_marked' and receipt_confirmation_due_at <= now()
    order by receipt_confirmation_due_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    update public.p2p_orders set status = 'review_required', updated_at = now() where id = target.id;
    insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key)
    values (target.id, 'system', 'receipt_timeout_review', 'p2p-receipt-review:' || target.id);
    perform public.create_notification_event('p2p.order.review_required', 'disputes', 'p2p_order', target.id::text,
      'P2P order needs review', 'Open the order for details.', '/?view=wallet.p2p',
      array[target.buyer_user_id, target.seller_user_id], 'p2p-receipt-review:' || target.id, '{}'::jsonb);
    review_count := review_count + 1;
  end loop;
  for target in select * from public.p2p_orders where status = 'released' and coverage_until <= now() order by coverage_until limit greatest(1, least(p_limit, 500)) for update skip locked loop
    update public.p2p_fund_accounts set reserved_amount = reserved_amount - target.fund_reserved_amount, updated_at = now() where id returning * into fund;
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
    values (target.id, 'release', target.fund_reserved_amount, fund.wallet_balance, fund.reserved_amount, 'p2p-fund-coverage-complete:' || target.id);
    update public.p2p_orders set status = 'settled', fund_reserved_amount = 0, updated_at = now() where id = target.id;
    insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key) values (target.id, 'system', 'coverage_completed', 'p2p-coverage-complete:' || target.id) on conflict do nothing;
    settled_count := settled_count + 1;
  end loop;
  return jsonb_build_object('cancelled', expired_count, 'reviewRequired', review_count, 'settled', settled_count);
end;
$$;

create or replace function public.p2p_cancel_ad(
  p_ad_id uuid,
  p_seller_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ad public.p2p_ads%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_balance numeric;
begin
  select * into ad from public.p2p_ads where id = p_ad_id for update;
  if not found or ad.seller_user_id <> p_seller_user_id then raise exception 'P2P ad access denied.'; end if;
  if ad.status = 'cancelled' then return to_jsonb(ad); end if;
  select * into wallet from public.wallet_accounts where user_id = p_seller_user_id for update;
  next_balance := wallet.balance + ad.available_amount;
  if ad.available_amount > 0 then
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_seller_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_seller_user_id, 'credit', ad.available_amount, '$', 'p2p_escrow_refund', 'p2p_ad', ad.id, next_balance, p_idempotency_key, jsonb_build_object('ad_id', ad.id));
  end if;
  update public.p2p_ads set status = 'cancelled', available_amount = 0, updated_at = now() where id = ad.id returning * into ad;
  return to_jsonb(ad);
end;
$$;

create or replace function public.p2p_admin_set_member(
  p_user_id uuid,
  p_status text,
  p_verified_name text,
  p_operator_user_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare member public.p2p_pilot_members%rowtype;
begin
  if p_status not in ('pending', 'active', 'suspended', 'revoked') then raise exception 'Invalid P2P member status.'; end if;
  insert into public.p2p_pilot_members (user_id, status, verified_name, approved_by, approved_at, notes, updated_at)
  values (p_user_id, p_status, nullif(btrim(p_verified_name), ''), p_operator_user_id, case when p_status = 'active' then now() else null end, nullif(btrim(p_notes), ''), now())
  on conflict (user_id) do update set status = excluded.status, verified_name = excluded.verified_name,
    approved_by = excluded.approved_by, approved_at = case when excluded.status = 'active' then now() else p2p_pilot_members.approved_at end,
    notes = excluded.notes, updated_at = now()
  returning * into member;
  return to_jsonb(member);
end;
$$;

create or replace function public.p2p_admin_fund_adjust(
  p_amount numeric,
  p_operation_type text,
  p_verification_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fund public.p2p_fund_accounts%rowtype;
  ledger public.p2p_fund_ledger%rowtype;
  next_balance numeric;
begin
  select * into ledger from public.p2p_fund_ledger where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(ledger); end if;
  if p_operation_type not in ('funding', 'correction') or p_amount = 0 or p_amount <> round(p_amount, 2) then raise exception 'Invalid fund adjustment.'; end if;
  if p_amount > 0 and nullif(btrim(p_verification_reference), '') is null then raise exception 'External fund verification reference is required.'; end if;
  select * into fund from public.p2p_fund_accounts where id for update;
  next_balance := fund.wallet_balance + p_amount;
  if next_balance < fund.reserved_amount then raise exception 'Fund adjustment would undercollateralize active coverage.'; end if;
  update public.p2p_fund_accounts set wallet_balance = next_balance,
    externally_verified_at = case when p_amount > 0 then now() else externally_verified_at end,
    verification_reference = coalesce(nullif(btrim(p_verification_reference), ''), verification_reference), updated_at = now() where id
  returning * into fund;
  insert into public.p2p_fund_ledger (operation_type, amount, balance_after, reserved_after, idempotency_key, metadata)
  values (p_operation_type, abs(p_amount), fund.wallet_balance, fund.reserved_amount, p_idempotency_key, jsonb_build_object('signedAmount', p_amount, 'verificationReference', p_verification_reference))
  returning * into ledger;
  return to_jsonb(ledger);
end;
$$;

create or replace function public.p2p_admin_resolve_dispute(
  p_order_id uuid,
  p_operator_user_id uuid,
  p_outcome text,
  p_reason text,
  p_guilty_user_id uuid,
  p_confirmed_fraud boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  target public.p2p_orders%rowtype;
  dispute public.p2p_disputes%rowtype;
  recipient_wallet public.wallet_accounts%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  collateral public.p2p_wallet_collateral%rowtype;
  claim public.p2p_recovery_claims%rowtype;
  recipient_id uuid;
  next_balance numeric;
  collateral_recovered numeric := 0;
begin
  if exists (select 1 from public.p2p_order_events where idempotency_key = p_idempotency_key) then select * into target from public.p2p_orders where id = p_order_id; return to_jsonb(target); end if;
  select * into target from public.p2p_orders where id = p_order_id for update;
  select * into dispute from public.p2p_disputes where order_id = p_order_id for update;
  if not found or dispute.status not in ('open', 'under_review', 'appealed') or target.status <> 'disputed' then raise exception 'Open P2P dispute is required.'; end if;
  select * into config from public.p2p_risk_configs where version = target.config_version;
  if nullif(btrim(p_reason), '') is null then raise exception 'Resolution reason is required.'; end if;
  if p_guilty_user_id is not null and p_guilty_user_id not in (target.buyer_user_id, target.seller_user_id) then raise exception 'Guilty user must be an order participant.'; end if;
  if p_outcome = 'dismiss' and p_guilty_user_id is not null then raise exception 'A dismissed complaint cannot penalize a participant.'; end if;
  if p_confirmed_fraud and p_guilty_user_id is null then raise exception 'Confirmed fraud requires a responsible participant.'; end if;
  if dispute.is_late and p_outcome not in ('dismiss', 'record_harm') then raise exception 'Late complaints have no reserved compensation coverage.'; end if;
  if p_outcome = 'record_harm' and (not dispute.is_late or p_guilty_user_id is null) then raise exception 'A late harm finding requires a responsible participant.'; end if;
  if p_outcome = 'release_to_buyer' then
    if target.released_at is not null then raise exception 'Wallet escrow was already released.'; end if;
    recipient_id := target.buyer_user_id;
  elsif p_outcome = 'refund_seller' then
    if target.released_at is not null then raise exception 'Wallet escrow was already released.'; end if;
    recipient_id := target.seller_user_id;
  elsif p_outcome = 'compensate_seller' then
    if target.released_at is null then raise exception 'Seller compensation requires an already released escrow.'; end if;
    if p_guilty_user_id is distinct from target.buyer_user_id then raise exception 'Seller compensation requires buyer liability.'; end if;
    recipient_id := target.seller_user_id;
    select * into fund from public.p2p_fund_accounts where id for update;
    if fund.wallet_balance < target.wallet_amount or fund.reserved_amount < target.fund_reserved_amount then raise exception 'Compensation fund is insufficient.'; end if;
    update public.p2p_fund_accounts set wallet_balance = wallet_balance - target.wallet_amount,
      reserved_amount = reserved_amount - target.fund_reserved_amount, updated_at = now() where id returning * into fund;
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
    values (target.id, 'compensation', target.wallet_amount, fund.wallet_balance, fund.reserved_amount, 'p2p-compensation:' || target.id);
    if p_guilty_user_id is not null then
      insert into public.p2p_recovery_claims (order_id, debtor_user_id, original_amount, outstanding_amount)
      values (target.id, p_guilty_user_id, target.wallet_amount, target.wallet_amount)
      on conflict (order_id, debtor_user_id) do nothing returning * into claim;
      select * into collateral from public.p2p_wallet_collateral where user_id = p_guilty_user_id for update;
      collateral_recovered := least(coalesce(collateral.amount, 0), target.wallet_amount);
      if collateral_recovered > 0 then
        update public.p2p_wallet_collateral set amount = amount - collateral_recovered, updated_at = now()
        where user_id = p_guilty_user_id;
        update public.p2p_recovery_claims set outstanding_amount = outstanding_amount - collateral_recovered,
          status = case when outstanding_amount - collateral_recovered <= 0 then 'repaid' else status end,
          updated_at = now() where id = claim.id;
        insert into public.p2p_recovery_events (claim_id, amount, event_type, idempotency_key)
        values (claim.id, collateral_recovered, 'wallet_collateral_used', 'p2p-collateral-recovery:' || target.id);
        update public.p2p_fund_accounts set wallet_balance = wallet_balance + collateral_recovered, updated_at = now() where id returning * into fund;
        insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key, metadata)
        values (target.id, 'funding', collateral_recovered, fund.wallet_balance, fund.reserved_amount,
          'p2p-collateral-fund-recovery:' || target.id, jsonb_build_object('source', 'wallet_collateral'));
      end if;
    end if;
  elsif p_outcome = 'dismiss' then
    if target.released_at is null then raise exception 'An unreleased escrow must be released or refunded.'; end if;
  elsif p_outcome = 'record_harm' then
    null;
  else raise exception 'Unsupported dispute outcome.';
  end if;
  if recipient_id is not null then
    select * into recipient_wallet from public.wallet_accounts where user_id = recipient_id for update;
    next_balance := recipient_wallet.balance + target.wallet_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = recipient_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
    values (recipient_id, 'credit', target.wallet_amount, '$', case when p_outcome = 'compensate_seller' then 'p2p_compensation' else case when recipient_id = target.buyer_user_id then 'p2p_escrow_release' else 'p2p_escrow_refund' end end,
      'p2p_order', target.id, case when recipient_id = target.buyer_user_id then target.seller_user_id else target.buyer_user_id end, next_balance,
      'p2p-resolution-credit:' || target.id, jsonb_build_object('outcome', p_outcome));
  end if;
  if p_outcome = 'refund_seller' then
    select * into fund from public.p2p_fund_accounts where id for update;
    update public.p2p_fund_accounts set reserved_amount = reserved_amount - target.fund_reserved_amount, updated_at = now() where id returning * into fund;
    if target.fund_reserved_amount > 0 then insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
      values (target.id, 'release', target.fund_reserved_amount, fund.wallet_balance, fund.reserved_amount, 'p2p-resolution-fund-release:' || target.id); end if;
  end if;
  update public.p2p_orders
  set status = case when p_outcome = 'release_to_buyer' or (p_outcome = 'dismiss' and not dispute.is_late) then 'released' else 'resolved' end,
      released_at = case when p_outcome = 'release_to_buyer' then now() else released_at end,
      coverage_until = case when p_outcome = 'release_to_buyer' then now() + make_interval(days => config.coverage_days) else coverage_until end,
      resolved_at = now(),
      fund_reserved_amount = case when p_outcome = 'release_to_buyer' or (p_outcome = 'dismiss' and not dispute.is_late) then fund_reserved_amount else 0 end,
      updated_at = now()
  where id = target.id returning * into target;
  update public.p2p_disputes set status = 'resolved', resolution = p_outcome, resolution_reason = left(p_reason, 4000), resolved_by = p_operator_user_id, resolved_at = now(), updated_at = now() where id = dispute.id;
  if p_guilty_user_id is not null then
    insert into public.p2p_trust_events (user_id, dispute_id, event_type, delta, idempotency_key, reason)
    values (p_guilty_user_id, dispute.id, case when p_confirmed_fraud then 'confirmed_fraud' else 'confirmed_harm' end, case when p_confirmed_fraud then -5 else -1 end, 'p2p-trust-resolution:' || dispute.id, left(p_reason, 4000));
    if p_confirmed_fraud then insert into public.p2p_restrictions (user_id, blocked, reason, source_dispute_id)
      values (p_guilty_user_id, true, left(p_reason, 1000), dispute.id)
      on conflict (user_id) do update set blocked = true, reason = excluded.reason, source_dispute_id = excluded.source_dispute_id, updated_at = now(); end if;
  end if;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (target.id, p_operator_user_id, 'operator', 'dispute_resolved', p_idempotency_key, jsonb_build_object('outcome', p_outcome, 'confirmedFraud', p_confirmed_fraud));
  perform public.create_notification_event('p2p.order.dispute_resolved', 'disputes', 'p2p_order', target.id::text,
    'P2P dispute updated', 'Open the order to see the decision.', '/?view=wallet.p2p',
    array[target.buyer_user_id, target.seller_user_id], 'p2p-dispute-resolved:' || target.id, '{}'::jsonb);
  return to_jsonb(target);
end;
$$;

create or replace function public.p2p_apply_core_recovery(
  p_user_id uuid,
  p_gross_accrual numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.p2p_recovery_claims%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  recovery_percent numeric;
  remaining_cap numeric;
  applied numeric;
  total_applied numeric := 0;
begin
  if p_gross_accrual is null or p_gross_accrual < 0 then raise exception 'Gross accrual cannot be negative.'; end if;
  if exists (select 1 from public.p2p_recovery_events where idempotency_key like p_idempotency_key || ':%') then
    select coalesce(sum(amount), 0) into total_applied from public.p2p_recovery_events where idempotency_key like p_idempotency_key || ':%';
    return jsonb_build_object('withheldAmount', total_applied, 'remainingAccrual', greatest(0, p_gross_accrual - total_applied));
  end if;
  select min(config.core_recovery_percent) into recovery_percent
  from public.p2p_recovery_claims active_claim
  join public.p2p_orders deal on deal.id = active_claim.order_id
  join public.p2p_risk_configs config on config.version = deal.config_version
  where active_claim.debtor_user_id = p_user_id and active_claim.status = 'active';
  -- Wallet and fund balances have two decimal places. Round down so a tiny
  -- accrual cannot create a fractional recovery that the fund cannot hold.
  remaining_cap := trunc(p_gross_accrual * coalesce(recovery_percent, 0) / 100, 2);
  if remaining_cap <= 0 or not exists (
    select 1 from public.p2p_recovery_claims where debtor_user_id = p_user_id and status = 'active'
  ) then
    return jsonb_build_object('withheldAmount', 0, 'remainingAccrual', p_gross_accrual);
  end if;
  select * into fund from public.p2p_fund_accounts where id for update;
  for claim in select * from public.p2p_recovery_claims where debtor_user_id = p_user_id and status = 'active' order by created_at for update loop
    exit when remaining_cap <= 0;
    applied := least(remaining_cap, claim.outstanding_amount);
    update public.p2p_recovery_claims set outstanding_amount = outstanding_amount - applied,
      status = case when outstanding_amount - applied <= 0 then 'repaid' else status end, updated_at = now() where id = claim.id;
    insert into public.p2p_recovery_events (claim_id, amount, event_type, idempotency_key, metadata)
    values (claim.id, applied, 'core_accrual_withheld', p_idempotency_key || ':' || claim.id, jsonb_build_object('grossAccrual', p_gross_accrual));
    update public.p2p_fund_accounts set wallet_balance = wallet_balance + applied, updated_at = now() where id returning * into fund;
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key, metadata)
    values (claim.order_id, 'funding', applied, fund.wallet_balance, fund.reserved_amount, p_idempotency_key || ':fund:' || claim.id, jsonb_build_object('source', 'core_recovery', 'claimId', claim.id));
    remaining_cap := remaining_cap - applied;
    total_applied := total_applied + applied;
  end loop;
  return jsonb_build_object('withheldAmount', total_applied, 'remainingAccrual', p_gross_accrual - total_applied);
end;
$$;

create or replace function public.p2p_admin_correct_dispute(
  p_order_id uuid,
  p_operator_user_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispute public.p2p_disputes%rowtype;
  trust_event public.p2p_trust_events%rowtype;
  claim public.p2p_recovery_claims%rowtype;
  debtor_wallet public.wallet_accounts%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  recovered numeric := 0;
  next_balance numeric;
begin
  if exists (select 1 from public.p2p_order_events where idempotency_key = p_idempotency_key) then
    select * into dispute from public.p2p_disputes where order_id = p_order_id;
    return to_jsonb(dispute);
  end if;
  select * into dispute from public.p2p_disputes where order_id = p_order_id for update;
  if not found or dispute.status not in ('resolved', 'appealed') then raise exception 'Resolved P2P dispute is required.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Correction reason is required.'; end if;
  for trust_event in select original.* from public.p2p_trust_events original where original.dispute_id = dispute.id and original.event_type in ('confirmed_harm', 'confirmed_fraud') and not exists (select 1 from public.p2p_trust_events correction where correction.reverses_event_id = original.id) for update of original loop
    insert into public.p2p_trust_events (user_id, dispute_id, event_type, delta, reverses_event_id, idempotency_key, reason)
    values (trust_event.user_id, dispute.id, 'correction', -trust_event.delta, trust_event.id, p_idempotency_key || ':trust:' || trust_event.id, p_reason);
    update public.p2p_restrictions set blocked = false, reason = p_reason, updated_at = now() where user_id = trust_event.user_id and source_dispute_id = dispute.id;
  end loop;
  for claim in select * from public.p2p_recovery_claims where order_id = p_order_id and status <> 'cancelled' for update loop
    select coalesce(sum(amount), 0) into recovered from public.p2p_recovery_events where claim_id = claim.id;
    if recovered > 0 then
      select * into fund from public.p2p_fund_accounts where id for update;
      if fund.wallet_balance < recovered then raise exception 'Fund cannot reverse the recovered amount.'; end if;
      select * into debtor_wallet from public.wallet_accounts where user_id = claim.debtor_user_id for update;
      next_balance := debtor_wallet.balance + recovered;
      update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = claim.debtor_user_id;
      update public.p2p_fund_accounts set wallet_balance = wallet_balance - recovered, updated_at = now() where id returning * into fund;
      insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
      values (claim.debtor_user_id, 'credit', recovered, '$', 'p2p_recovery', 'p2p_recovery', claim.id, next_balance, p_idempotency_key || ':wallet:' || claim.id, jsonb_build_object('correction', true));
      insert into public.p2p_recovery_events (claim_id, amount, event_type, idempotency_key, metadata)
      values (claim.id, -recovered, 'correction', p_idempotency_key || ':recovery:' || claim.id, jsonb_build_object('reason', p_reason));
      insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key, metadata)
      values (p_order_id, 'correction', recovered, fund.wallet_balance, fund.reserved_amount, p_idempotency_key || ':fund:' || claim.id, jsonb_build_object('reason', p_reason));
    end if;
    update public.p2p_recovery_claims set status = 'cancelled', outstanding_amount = 0, updated_at = now() where id = claim.id;
  end loop;
  update public.p2p_disputes set status = 'corrected', resolution_reason = resolution_reason || E'\nCorrection: ' || left(p_reason, 3000), updated_at = now() where id = dispute.id returning * into dispute;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (p_order_id, p_operator_user_id, 'operator', 'resolution_corrected', p_idempotency_key, jsonb_build_object('reason', p_reason));
  perform public.create_notification_event('p2p.order.resolution_corrected', 'disputes', 'p2p_order', p_order_id::text,
    'P2P dispute updated', 'Open the order to see the correction.', '/?view=wallet.p2p',
    array[(select buyer_user_id from public.p2p_orders where id = p_order_id), (select seller_user_id from public.p2p_orders where id = p_order_id)],
    'p2p-dispute-corrected:' || p_order_id, '{}'::jsonb);
  return to_jsonb(dispute);
end;
$$;

alter table public.daily_core_accruals
  add column if not exists p2p_recovery_amount numeric(30, 12) not null default 0 check (p2p_recovery_amount >= 0);
alter table public.daily_core_accruals
  add constraint daily_core_accrual_p2p_split_check
  check (abs(gross_amount - core_amount - wallet_amount - p2p_recovery_amount) <= 0.00000001) not valid;
alter table public.core_accrual_obligations
  add column if not exists expected_p2p_recovery_amount numeric(30, 12) not null default 0 check (expected_p2p_recovery_amount >= 0);
alter table public.core_accrual_obligations
  add constraint core_obligation_p2p_split_check
  check (abs(expected_gross_amount - expected_core_amount - expected_wallet_amount - expected_p2p_recovery_amount) <= 0.00000001) not valid;

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
      core_amount, wallet_amount, core_after, obligation_id, p2p_recovery_amount
    ) values (
      p_accrual_date, account.user_id, account.balance, daily_rate, gross_amount, account.reinvest_percent,
      core_amount, wallet_amount, account.balance + core_amount, obligation_id, recovery_amount
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

revoke all on function public.p2p_available_limit(uuid, text) from public, anon, authenticated;
revoke all on function public.p2p_change_collateral(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.p2p_create_sell_ad(uuid, uuid, numeric, numeric, numeric, numeric, boolean, text) from public, anon, authenticated;
revoke all on function public.p2p_create_order(uuid, uuid, numeric, boolean, text) from public, anon, authenticated;
revoke all on function public.p2p_order_action(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.p2p_process_timers(integer) from public, anon, authenticated;
revoke all on function public.p2p_cancel_ad(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.p2p_admin_set_member(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.p2p_admin_fund_adjust(numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.p2p_admin_resolve_dispute(uuid, uuid, text, text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.p2p_apply_core_recovery(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.p2p_admin_correct_dispute(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.p2p_available_limit(uuid, text) to service_role;
grant execute on function public.p2p_change_collateral(uuid, numeric, text) to service_role;
grant execute on function public.p2p_create_sell_ad(uuid, uuid, numeric, numeric, numeric, numeric, boolean, text) to service_role;
grant execute on function public.p2p_create_order(uuid, uuid, numeric, boolean, text) to service_role;
grant execute on function public.p2p_order_action(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.p2p_process_timers(integer) to service_role;
grant execute on function public.p2p_cancel_ad(uuid, uuid, text) to service_role;
grant execute on function public.p2p_admin_set_member(uuid, text, text, uuid, text) to service_role;
grant execute on function public.p2p_admin_fund_adjust(numeric, text, text, text) to service_role;
grant execute on function public.p2p_admin_resolve_dispute(uuid, uuid, text, text, uuid, boolean, text) to service_role;
grant execute on function public.p2p_apply_core_recovery(uuid, numeric, text) to service_role;
grant execute on function public.p2p_admin_correct_dispute(uuid, uuid, text, text) to service_role;

-- Expired unpaid orders, receipt reviews and completed coverage must progress
-- even when neither participant opens the app.
select cron.schedule(
  'open-abundance-p2p-timers',
  '* * * * *',
  $$select public.p2p_process_timers(100);$$
);
