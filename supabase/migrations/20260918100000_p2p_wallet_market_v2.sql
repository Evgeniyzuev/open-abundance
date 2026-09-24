-- Telegram Wallet style P2P market flow for Open Abundance.
-- Existing sell ads/orders remain compatible; new records use the direction
-- column and the pending_acceptance step.

alter table public.p2p_payment_methods
  add column if not exists is_reusable boolean not null default true;

alter table public.p2p_ads
  add column if not exists direction text not null default 'sell',
  add column if not exists payment_method_types text[] not null default array['sbp', 'bank_transfer'];

alter table public.p2p_ads
  drop constraint if exists p2p_ads_direction_check;
alter table public.p2p_ads
  add constraint p2p_ads_direction_check check (direction in ('buy', 'sell'));
alter table public.p2p_ads
  alter column payment_method_id drop not null;

alter table public.p2p_orders
  add column if not exists direction text not null default 'sell',
  add column if not exists ad_owner_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists requester_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists accept_due_at timestamptz,
  add column if not exists accepted_at timestamptz;

update public.p2p_orders
set direction = coalesce(direction, 'sell'),
    ad_owner_user_id = coalesce(ad_owner_user_id, seller_user_id),
    requester_user_id = coalesce(requester_user_id, buyer_user_id),
    accepted_at = coalesce(accepted_at, created_at)
where ad_owner_user_id is null or requester_user_id is null;

alter table public.p2p_orders
  drop constraint if exists p2p_orders_status_check;
alter table public.p2p_orders
  add constraint p2p_orders_status_check check (status in (
    'pending_acceptance', 'awaiting_payment', 'payment_marked', 'review_required',
    'released', 'disputed', 'resolved', 'settled', 'cancelled'
  ));
alter table public.p2p_orders
  drop constraint if exists p2p_orders_direction_check;
alter table public.p2p_orders
  add constraint p2p_orders_direction_check check (direction in ('buy', 'sell'));

create index if not exists p2p_ads_direction_idx on public.p2p_ads (direction, created_at desc) where status = 'active';
create index if not exists p2p_orders_accept_due_idx on public.p2p_orders (accept_due_at) where status = 'pending_acceptance';

create table if not exists public.p2p_order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.p2p_orders(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body text check (body is null or char_length(body) between 1 and 4000),
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  check (body is not null or attachment_path is not null),
  check (attachment_mime is null or attachment_mime in ('image/jpeg', 'image/png', 'application/pdf')),
  check (attachment_size is null or attachment_size between 1 and 10485760)
);
create index if not exists p2p_order_messages_order_idx on public.p2p_order_messages(order_id, created_at);
alter table public.p2p_order_messages enable row level security;
revoke all on public.p2p_order_messages from anon, authenticated;

-- The bucket is private. Service-role routes issue short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('p2p-order-attachments', 'p2p-order-attachments', false)
on conflict (id) do update set public = false;

create or replace function public.p2p_available_limit(p_user_id uuid, p_role text default 'buyer')
returns jsonb
language plpgsql security definer set search_path = ''
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
  select coalesce(sum(available_amount), 0) into reserved_trade_principal
    from public.p2p_ads where seller_user_id = p_user_id and direction = 'sell' and status in ('active', 'closed');
  select coalesce(sum(wallet_amount), 0) into outstanding from public.p2p_orders
    where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
      and (status in ('pending_acceptance', 'awaiting_payment', 'payment_marked', 'review_required', 'disputed')
        or (status = 'released' and coverage_until > now()));
  select coalesce(sum(wallet_amount), 0) into turnover from public.p2p_orders
    where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
      and created_at > now() - interval '24 hours' and status <> 'cancelled';
  select count(distinct case when buyer_user_id = p_user_id then seller_user_id else buyer_user_id end)
    into matured_counterparties from public.p2p_orders
    where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
      and status = 'settled' and coverage_until <= now();
  select count(*) into active_orders from public.p2p_orders
    where (buyer_user_id = p_user_id or seller_user_id = p_user_id)
      and status in ('pending_acceptance', 'awaiting_payment', 'payment_marked', 'review_required', 'disputed');
  select summary.raw_score into trust_score from public.trust_v2_shadow_summaries summary
    where summary.user_id = p_user_id order by summary.as_of_date desc, summary.config_version desc limit 1;
  trust_score := coalesce(trust_score, 0);
  select coalesce(sum(delta), 0) into trust_adjustment from public.p2p_trust_events where user_id = p_user_id;
  trust_score := trust_score + trust_adjustment;
  if trust_score <= 0 then trust_factor := 0;
  else
    select tier.factor into trust_factor from public.p2p_trust_tiers tier
      where tier.config_version = config.version and trust_score >= tier.minimum_score
        and (tier.maximum_score is null or trust_score < tier.maximum_score)
      order by tier.tier_order limit 1;
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
  if member_status is distinct from 'active' or is_blocked or active_orders >= config.max_concurrent_orders
    or (config.trust_enforcement_enabled and trust_factor = 0) then available := 0; end if;
  return jsonb_build_object(
    'configVersion', config.version, 'availableAmount', round(available, 2),
    'memberStatus', coalesce(member_status, 'not_invited'), 'blocked', is_blocked,
    'activeOrders', active_orders, 'outstandingRisk', round(outstanding, 2),
    'rolling24hTurnover', round(turnover, 2), 'maturedCounterparties', matured_counterparties,
    'growthUnlocked', growth_unlocked, 'coreSecurity', core_security, 'freeCollateral', collateral_free,
    'reservedTradePrincipal', reserved_trade_principal, 'role', p_role,
    'trustScore', trust_score, 'trustFactor', trust_factor, 'trustEnforced', config.trust_enforcement_enabled
  );
end;
$$;

create or replace function public.p2p_create_ad_v2(
  p_owner_user_id uuid,
  p_direction text,
  p_payment_method_id uuid,
  p_wallet_amount numeric,
  p_rub_per_wallet numeric,
  p_min_wallet_amount numeric,
  p_max_wallet_amount numeric,
  p_accept_core_recovery boolean,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  wallet public.wallet_accounts%rowtype;
  method public.p2p_payment_methods%rowtype;
  existing public.p2p_ads%rowtype;
  created_ad public.p2p_ads%rowtype;
  next_balance numeric;
begin
  select * into existing from public.p2p_ads where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(existing); end if;
  if p_direction not in ('buy', 'sell') then raise exception 'Invalid P2P ad direction.'; end if;
  select * into config from public.p2p_risk_configs where is_active limit 1;
  if not exists (select 1 from public.p2p_pilot_members where user_id = p_owner_user_id and status = 'active') then raise exception 'P2P access is required.'; end if;
  if p_accept_core_recovery is distinct from true then raise exception 'Core recovery terms must be accepted.'; end if;
  if p_wallet_amount <= 0 or p_wallet_amount > config.max_order_amount or p_wallet_amount <> round(p_wallet_amount, 2) then raise exception 'Invalid Wallet amount.'; end if;
  if p_min_wallet_amount <= 0 or p_max_wallet_amount < p_min_wallet_amount or p_max_wallet_amount > p_wallet_amount then raise exception 'Invalid order range.'; end if;
  if p_rub_per_wallet <= 0 or p_rub_per_wallet <> round(p_rub_per_wallet, 4) then raise exception 'Invalid RUB rate.'; end if;
  if p_direction = 'sell' then
    if p_payment_method_id is null then raise exception 'Payment method is required for a sell ad.'; end if;
    select * into method from public.p2p_payment_methods where id = p_payment_method_id and user_id = p_owner_user_id and is_active for update;
    if not found then raise exception 'Active own payment method is required.'; end if;
    select * into wallet from public.wallet_accounts where user_id = p_owner_user_id for update;
    if not found or wallet.balance < p_wallet_amount then raise exception 'Insufficient Wallet balance.'; end if;
    next_balance := wallet.balance - p_wallet_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_owner_user_id;
  else
    if p_payment_method_id is not null then raise exception 'Buy ads do not publish payment details.'; end if;
  end if;
  insert into public.p2p_ads (seller_user_id, direction, payment_method_id, wallet_amount, available_amount, rub_per_wallet, min_wallet_amount, max_wallet_amount, core_recovery_accepted_at, idempotency_key)
  values (p_owner_user_id, p_direction, p_payment_method_id, p_wallet_amount, p_wallet_amount, p_rub_per_wallet, p_min_wallet_amount, p_max_wallet_amount, now(), p_idempotency_key)
  returning * into created_ad;
  if p_direction = 'sell' then
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_owner_user_id, 'debit', p_wallet_amount, '$', 'p2p_escrow_hold', 'p2p_ad', created_ad.id, next_balance, 'p2p-ad-hold:' || created_ad.id, jsonb_build_object('ad_id', created_ad.id));
  end if;
  return to_jsonb(created_ad);
end;
$$;

create or replace function public.p2p_create_order_v2(
  p_requester_user_id uuid,
  p_ad_id uuid,
  p_wallet_amount numeric,
  p_payment_method_id uuid,
  p_accept_core_recovery boolean,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  ad public.p2p_ads%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  method public.p2p_payment_methods%rowtype;
  created_order public.p2p_orders%rowtype;
  requester_limit jsonb;
  owner_limit jsonb;
  terms jsonb;
  buyer_id uuid;
  seller_id uuid;
  owner_id uuid;
  next_balance numeric;
  seller_wallet public.wallet_accounts%rowtype;
begin
  select * into created_order from public.p2p_orders where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(created_order); end if;
  select * into config from public.p2p_risk_configs where is_active limit 1;
  select * into ad from public.p2p_ads where id = p_ad_id for update;
  if not found or ad.status <> 'active' then raise exception 'P2P ad is unavailable.'; end if;
  owner_id := ad.seller_user_id;
  if p_requester_user_id = owner_id then raise exception 'Cannot trade with yourself.'; end if;
  if p_accept_core_recovery is distinct from true then raise exception 'Core recovery terms must be accepted.'; end if;
  if p_wallet_amount <> round(p_wallet_amount, 2) or p_wallet_amount < ad.min_wallet_amount or p_wallet_amount > least(ad.max_wallet_amount, ad.available_amount) then raise exception 'Order amount is outside the ad range.'; end if;
  if ad.direction = 'sell' then
    buyer_id := p_requester_user_id; seller_id := owner_id;
    if ad.payment_method_id is null then raise exception 'Sell ad payment details are missing.'; end if;
    select * into method from public.p2p_payment_methods where id = ad.payment_method_id and is_active for update;
  else
    buyer_id := owner_id; seller_id := p_requester_user_id;
    if p_payment_method_id is null then raise exception 'Payment details are required to sell to a buy ad.'; end if;
    select * into method from public.p2p_payment_methods where id = p_payment_method_id and user_id = seller_id and is_active for update;
    if not found then raise exception 'Active own payment method is required.'; end if;
    select * into seller_wallet from public.wallet_accounts where user_id = seller_id for update;
    if not found or seller_wallet.balance < p_wallet_amount then raise exception 'Insufficient Wallet balance.'; end if;
    next_balance := seller_wallet.balance - p_wallet_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = seller_id;
  end if;
  perform 1 from public.p2p_pilot_members where user_id in (buyer_id, seller_id) order by user_id for update;
  requester_limit := public.p2p_available_limit(buyer_id, 'buyer');
  owner_limit := public.p2p_available_limit(seller_id, 'seller');
  if (requester_limit->>'availableAmount')::numeric < p_wallet_amount or (owner_limit->>'availableAmount')::numeric < p_wallet_amount then raise exception 'P2P risk limit is insufficient.'; end if;
  select * into fund from public.p2p_fund_accounts where id for update;
  if fund.externally_verified_at is null or fund.wallet_balance - fund.reserved_amount < p_wallet_amount then raise exception 'Compensation fund coverage is insufficient.'; end if;
  terms := jsonb_build_object(
    'direction', ad.direction, 'beginnerUnsecuredLimit', config.beginner_unsecured_limit,
    'coreHorizonDays', config.core_horizon_days, 'coreDailyRate', config.core_daily_rate,
    'coreCoveragePercent', config.core_coverage_percent, 'coreRecoveryPercent', config.core_recovery_percent,
    'coverageDays', config.coverage_days, 'maxConcurrentOrders', config.max_concurrent_orders,
    'maxOrderAmount', config.max_order_amount, 'rolling24hLimit', config.rolling_24h_limit,
    'paymentMinutes', config.payment_minutes, 'acceptanceMinutes', 5,
    'receiptConfirmationMinutes', config.receipt_confirmation_minutes, 'pilotFeePercent', config.pilot_fee_percent,
    'trustEnforced', config.trust_enforcement_enabled, 'buyerAcceptedCoreRecoveryAt', now(),
    'sellerAcceptedCoreRecoveryAt', ad.core_recovery_accepted_at, 'rubPerWallet', ad.rub_per_wallet,
    'paymentMethodId', method.id, 'paymentDetails', jsonb_build_object(
      'methodType', method.method_type, 'label', method.label, 'encryptedPayload', method.encrypted_payload,
      'encryptionIv', method.encryption_iv, 'encryptionTag', method.encryption_tag, 'keyVersion', method.key_version
    ), 'buyerLimit', requester_limit, 'sellerLimit', owner_limit
  );
  update public.p2p_ads set available_amount = available_amount - p_wallet_amount, updated_at = now(),
    status = case when available_amount - p_wallet_amount = 0 then 'closed' else status end where id = ad.id;
  update public.p2p_fund_accounts set reserved_amount = reserved_amount + p_wallet_amount, updated_at = now() where id;
  insert into public.p2p_orders (ad_id, buyer_user_id, seller_user_id, ad_owner_user_id, requester_user_id, direction, payment_method_id, config_version, wallet_amount, rub_amount, status, payment_due_at, accept_due_at, fund_reserved_amount, terms_snapshot, idempotency_key)
  values (ad.id, buyer_id, seller_id, owner_id, p_requester_user_id, ad.direction, method.id, config.version, p_wallet_amount, round(p_wallet_amount * ad.rub_per_wallet, 2), 'pending_acceptance', now() + interval '15 minutes', now() + interval '5 minutes', p_wallet_amount, terms, p_idempotency_key)
  returning * into created_order;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (created_order.id, p_requester_user_id, case when p_requester_user_id = buyer_id then 'buyer' else 'seller' end, 'created', 'p2p-order-created:' || created_order.id, jsonb_build_object('direction', ad.direction));
  insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
  values (created_order.id, 'reserve', p_wallet_amount, fund.wallet_balance, fund.reserved_amount + p_wallet_amount, 'p2p-fund-reserve:' || created_order.id);
  perform public.create_notification_event('p2p.order.created', 'deals', 'p2p_order', created_order.id::text, 'P2P order request', 'Open the order to review the next step.', '/?view=wallet.p2p&order=' || created_order.id::text, array[buyer_id, seller_id], 'p2p-order-created:' || created_order.id, '{}'::jsonb);
  return to_jsonb(created_order);
end;
$$;

-- Forward declaration so the action function can be replaced in one migration.
create or replace function public.p2p_release_order_reserve(p_order_id uuid, p_idempotency_key text)
returns void language plpgsql security definer set search_path = ''
as $$ begin return; end; $$;

create or replace function public.p2p_order_action(
  p_order_id uuid, p_actor_user_id uuid, p_action text, p_idempotency_key text, p_evidence jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  config public.p2p_risk_configs%rowtype;
  target public.p2p_orders%rowtype;
  ad public.p2p_ads%rowtype;
  actor_kind text;
  buyer_wallet public.wallet_accounts%rowtype;
  seller_wallet public.wallet_accounts%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  next_balance numeric;
begin
  select * into target from public.p2p_orders where id = p_order_id for update;
  if not found or p_actor_user_id not in (target.buyer_user_id, target.seller_user_id) then raise exception 'P2P order access denied.'; end if;
  if exists (select 1 from public.p2p_order_events where idempotency_key = p_idempotency_key and order_id = p_order_id and actor_user_id = p_actor_user_id and event_type = p_action) then return to_jsonb(target); end if;
  actor_kind := case when p_actor_user_id = target.buyer_user_id then 'buyer' else 'seller' end;
  select * into config from public.p2p_risk_configs where version = target.config_version;
  if p_action = 'accept_order' then
    if p_actor_user_id <> target.ad_owner_user_id or target.status <> 'pending_acceptance' or target.accept_due_at < now() then raise exception 'Order request cannot be accepted.'; end if;
    update public.p2p_orders set status = 'awaiting_payment', accepted_at = now(), payment_due_at = now() + make_interval(mins => config.payment_minutes), updated_at = now() where id = target.id returning * into target;
  elsif p_action = 'reject_order' then
    if p_actor_user_id <> target.ad_owner_user_id or target.status <> 'pending_acceptance' then raise exception 'Order request cannot be rejected.'; end if;
    perform public.p2p_release_order_reserve(target.id, 'p2p-order-reject:' || target.id);
    select * into target from public.p2p_orders where id = target.id;
  elsif p_action = 'mark_paid' then
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
    if not ((target.status = 'pending_acceptance' and p_actor_user_id = target.requester_user_id) or (target.status = 'awaiting_payment' and actor_kind = 'buyer')) then raise exception 'Order cannot be cancelled at this step.'; end if;
    perform public.p2p_release_order_reserve(target.id, 'p2p-order-cancel:' || target.id);
    select * into target from public.p2p_orders where id = target.id;
  elsif p_action = 'open_dispute' then
    if target.status not in ('payment_marked', 'review_required', 'released', 'settled') or (target.status = 'released' and target.coverage_until < now()) then raise exception 'Order is outside the dispute window.'; end if;
    if exists (select 1 from public.p2p_disputes where order_id = target.id) then raise exception 'This order already has a dispute; request an appeal from the operator.'; end if;
    if nullif(btrim(p_evidence->>'reason'), '') is null then raise exception 'Dispute reason is required.'; end if;
    insert into public.p2p_disputes (order_id, opened_by, reason, is_late) values (target.id, p_actor_user_id, left(p_evidence->>'reason', 2000), target.status = 'settled');
    update public.p2p_orders set status = 'disputed', updated_at = now() where id = target.id returning * into target;
  elsif p_action = 'appeal' then
    if nullif(btrim(p_evidence->>'reason'), '') is null then raise exception 'Appeal reason is required.'; end if;
    update public.p2p_disputes set status = 'appealed', appeal_reason = left(p_evidence->>'reason', 2000), updated_at = now() where order_id = target.id and status = 'resolved' and resolved_at >= now() - interval '7 days';
    if not found then raise exception 'Resolved dispute is outside the appeal window.'; end if;
  else raise exception 'Unsupported P2P order action.';
  end if;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (target.id, p_actor_user_id, actor_kind, p_action, p_idempotency_key, coalesce(p_evidence, '{}'::jsonb));
  perform public.create_notification_event('p2p.order.' || p_action, case when p_action = 'open_dispute' then 'disputes' else 'deals' end, 'p2p_order', target.id::text, 'P2P order updated', 'Open the order to see its current status.', '/?view=wallet.p2p&order=' || target.id::text, array[target.buyer_user_id, target.seller_user_id], 'p2p-action:' || p_idempotency_key, '{}'::jsonb);
  return to_jsonb(target);
end;
$$;

create or replace function public.p2p_release_order_reserve(p_order_id uuid, p_idempotency_key text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  target public.p2p_orders%rowtype;
  ad public.p2p_ads%rowtype;
  wallet public.wallet_accounts%rowtype;
  fund public.p2p_fund_accounts%rowtype;
  next_balance numeric;
begin
  select * into target from public.p2p_orders where id = p_order_id for update;
  if not found or target.status not in ('pending_acceptance', 'awaiting_payment') then return; end if;
  select * into ad from public.p2p_ads where id = target.ad_id for update;
  if target.direction = 'sell' then
    update public.p2p_ads set available_amount = least(wallet_amount, available_amount + target.wallet_amount), status = case when status = 'closed' then 'active' else status end, updated_at = now() where id = target.ad_id;
  else
    select * into wallet from public.wallet_accounts where user_id = target.seller_user_id for update;
    if found then
      next_balance := wallet.balance + target.wallet_amount;
      update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = target.seller_user_id;
      insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
      values (target.seller_user_id, 'credit', target.wallet_amount, '$', 'p2p_escrow_refund', 'p2p_order', target.id, next_balance, p_idempotency_key || ':wallet', jsonb_build_object('order_id', target.id));
    end if;
  end if;
  update public.p2p_fund_accounts set reserved_amount = greatest(0, reserved_amount - target.fund_reserved_amount), updated_at = now() where id returning * into fund;
  if target.fund_reserved_amount > 0 then
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
    values (target.id, 'release', target.fund_reserved_amount, fund.wallet_balance, fund.reserved_amount, p_idempotency_key || ':fund') on conflict do nothing;
  end if;
  update public.p2p_orders set status = 'cancelled', fund_reserved_amount = 0, updated_at = now() where id = target.id;
  insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key) values (target.id, 'system', 'reserve_released', p_idempotency_key) on conflict do nothing;
end;
$$;

create or replace function public.p2p_process_timers(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  target public.p2p_orders%rowtype;
  review_count integer := 0;
  expired_count integer := 0;
  settled_count integer := 0;
begin
  for target in select * from public.p2p_orders where status = 'pending_acceptance' and accept_due_at <= now() order by accept_due_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    perform public.p2p_release_order_reserve(target.id, 'p2p-pending-timeout:' || target.id);
    expired_count := expired_count + 1;
  end loop;
  for target in select * from public.p2p_orders where status = 'awaiting_payment' and payment_due_at <= now() order by payment_due_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    perform public.p2p_release_order_reserve(target.id, 'p2p-payment-timeout:' || target.id);
    expired_count := expired_count + 1;
  end loop;
  for target in select * from public.p2p_orders where status = 'payment_marked' and receipt_confirmation_due_at <= now() order by receipt_confirmation_due_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    update public.p2p_orders set status = 'review_required', updated_at = now() where id = target.id;
    insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key) values (target.id, 'system', 'receipt_timeout_review', 'p2p-receipt-review:' || target.id) on conflict do nothing;
    review_count := review_count + 1;
  end loop;
  for target in select * from public.p2p_orders where status = 'released' and coverage_until <= now() order by coverage_until limit greatest(1, least(p_limit, 500)) for update skip locked loop
    update public.p2p_fund_accounts set reserved_amount = greatest(0, reserved_amount - target.fund_reserved_amount), updated_at = now() where id;
    update public.p2p_orders set status = 'settled', fund_reserved_amount = 0, updated_at = now() where id = target.id;
    insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key) values (target.id, 'system', 'coverage_completed', 'p2p-coverage-complete:' || target.id) on conflict do nothing;
    settled_count := settled_count + 1;
  end loop;
  return jsonb_build_object('cancelled', expired_count, 'reviewRequired', review_count, 'settled', settled_count);
end;
$$;

create or replace function public.p2p_cancel_ad(p_ad_id uuid, p_seller_user_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ad public.p2p_ads%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_balance numeric;
begin
  select * into ad from public.p2p_ads where id = p_ad_id for update;
  if not found or ad.seller_user_id <> p_seller_user_id then raise exception 'P2P ad access denied.'; end if;
  if ad.status = 'cancelled' then return to_jsonb(ad); end if;
  if ad.direction = 'sell' and ad.available_amount > 0 then
    select * into wallet from public.wallet_accounts where user_id = p_seller_user_id for update;
    next_balance := wallet.balance + ad.available_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_seller_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_seller_user_id, 'credit', ad.available_amount, '$', 'p2p_escrow_refund', 'p2p_ad', ad.id, next_balance, p_idempotency_key, jsonb_build_object('ad_id', ad.id));
  end if;
  update public.p2p_ads set status = 'cancelled', available_amount = 0, updated_at = now() where id = ad.id returning * into ad;
  return to_jsonb(ad);
end;
$$;

create or replace function public.p2p_set_ad_status(p_ad_id uuid, p_owner_user_id uuid, p_status text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ad public.p2p_ads%rowtype;
begin
  select * into ad from public.p2p_ads where id = p_ad_id for update;
  if not found or ad.seller_user_id <> p_owner_user_id then raise exception 'P2P ad access denied.'; end if;
  if p_status not in ('active', 'paused') then raise exception 'Invalid ad status.'; end if;
  if p_status = 'active' and ad.available_amount <= 0 then raise exception 'Ad has no available amount.'; end if;
  update public.p2p_ads set status = p_status, updated_at = now() where id = ad.id returning * into ad;
  return to_jsonb(ad);
end;
$$;

revoke all on function public.p2p_create_ad_v2(uuid, text, uuid, numeric, numeric, numeric, numeric, boolean, text) from public, anon, authenticated;
revoke all on function public.p2p_create_order_v2(uuid, uuid, numeric, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.p2p_release_order_reserve(uuid, text) from public, anon, authenticated;
grant execute on function public.p2p_create_ad_v2(uuid, text, uuid, numeric, numeric, numeric, numeric, boolean, text) to service_role;
grant execute on function public.p2p_create_order_v2(uuid, uuid, numeric, uuid, boolean, text) to service_role;
grant execute on function public.p2p_release_order_reserve(uuid, text) to service_role;
grant execute on function public.p2p_order_action(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.p2p_process_timers(integer) to service_role;
grant execute on function public.p2p_cancel_ad(uuid, uuid, text) to service_role;
revoke all on function public.p2p_set_ad_status(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.p2p_set_ad_status(uuid, uuid, text, text) to service_role;
