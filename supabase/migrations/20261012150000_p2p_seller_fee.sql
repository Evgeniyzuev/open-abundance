-- P2P project fee: paid by the seller (the side that cashes out), 1% of the Wallet amount. The buyer receives the full
-- amount. This replaces the earlier version that kept the fee out of the buyer's credit.
--
-- The seller holds the fee together with the escrow and it is used up order by order:
--   * sell ad: the ad holds escrow + fee at publication (fee_reserved); each order takes its share from it, and the
--     last order takes what is left, so nothing stays locked;
--   * buy ad: the seller who responds holds escrow + fee when the order is created;
--   * when the escrow is released to the buyer, the held fee is charged (it simply stays with the project);
--   * when the escrow goes back to the seller (cancel, reject, timeouts, a dispute resolved as a refund), the held fee
--     goes back with it; cancelling an ad returns the unused escrow and the unused fee.
-- Every order records its share (seller_fee) and where it is (seller_fee_status: none, held, charged, returned).

alter table public.p2p_ads add column if not exists fee_reserved numeric(20, 2) not null default 0 check (fee_reserved >= 0);
alter table public.p2p_orders add column if not exists seller_fee numeric(20, 2) not null default 0 check (seller_fee >= 0);
alter table public.p2p_orders add column if not exists seller_fee_status text not null default 'none' check (seller_fee_status in ('none', 'held', 'charged', 'returned'));

update public.p2p_risk_configs set pilot_fee_percent = 1 where version = 'p2p-pilot-v1';

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
  ad_fee numeric := 0;
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
    -- The seller pays the project fee: it is held together with the escrow and used up order by order.
    ad_fee := round(p_wallet_amount * config.pilot_fee_percent / 100, 2);
    if p_payment_method_id is null then raise exception 'Payment method is required for a sell ad.'; end if;
    select * into method from public.p2p_payment_methods where id = p_payment_method_id and user_id = p_owner_user_id and is_active for update;
    if not found then raise exception 'Active own payment method is required.'; end if;
    select * into wallet from public.wallet_accounts where user_id = p_owner_user_id for update;
    if not found or wallet.balance < p_wallet_amount + ad_fee then raise exception 'Insufficient Wallet balance.'; end if;
    next_balance := wallet.balance - p_wallet_amount - ad_fee;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_owner_user_id;
  else
    if p_payment_method_id is not null then raise exception 'Buy ads do not publish payment details.'; end if;
  end if;
  insert into public.p2p_ads (seller_user_id, direction, payment_method_id, wallet_amount, available_amount, rub_per_wallet, min_wallet_amount, max_wallet_amount, core_recovery_accepted_at, idempotency_key, fee_reserved)
  values (p_owner_user_id, p_direction, p_payment_method_id, p_wallet_amount, p_wallet_amount, p_rub_per_wallet, p_min_wallet_amount, p_max_wallet_amount, now(), p_idempotency_key, ad_fee)
  returning * into created_ad;
  if p_direction = 'sell' then
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_owner_user_id, 'debit', p_wallet_amount + ad_fee, '$', 'p2p_escrow_hold', 'p2p_ad', created_ad.id, next_balance, 'p2p-ad-hold:' || created_ad.id, jsonb_build_object('ad_id', created_ad.id, 'escrow', p_wallet_amount, 'seller_fee', ad_fee));
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
  order_fee numeric := 0;
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
  order_fee := round(p_wallet_amount * config.pilot_fee_percent / 100, 2);
  if ad.direction = 'sell' then
    buyer_id := p_requester_user_id; seller_id := owner_id;
    -- Prepaid by the ad; the last order takes whatever is left so nothing stays locked.
    order_fee := case when ad.available_amount - p_wallet_amount = 0 then ad.fee_reserved else least(order_fee, ad.fee_reserved) end;
    if ad.payment_method_id is null then raise exception 'Sell ad payment details are missing.'; end if;
    select * into method from public.p2p_payment_methods where id = ad.payment_method_id and is_active for update;
  else
    buyer_id := owner_id; seller_id := p_requester_user_id;
    if p_payment_method_id is null then raise exception 'Payment details are required to sell to a buy ad.'; end if;
    select * into method from public.p2p_payment_methods where id = p_payment_method_id and user_id = seller_id and is_active for update;
    if not found then raise exception 'Active own payment method is required.'; end if;
    select * into seller_wallet from public.wallet_accounts where user_id = seller_id for update;
    if not found or seller_wallet.balance < p_wallet_amount + order_fee then raise exception 'Insufficient Wallet balance.'; end if;
    next_balance := seller_wallet.balance - p_wallet_amount - order_fee;
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
  update public.p2p_ads set available_amount = available_amount - p_wallet_amount, fee_reserved = greatest(0, fee_reserved - case when ad.direction = 'sell' then order_fee else 0 end), updated_at = now(),
    status = case when available_amount - p_wallet_amount = 0 then 'closed' else status end where id = ad.id;
  update public.p2p_fund_accounts set reserved_amount = reserved_amount + p_wallet_amount, updated_at = now() where id;
  insert into public.p2p_orders (ad_id, buyer_user_id, seller_user_id, ad_owner_user_id, requester_user_id, direction, payment_method_id, config_version, wallet_amount, rub_amount, status, payment_due_at, accept_due_at, fund_reserved_amount, terms_snapshot, idempotency_key, seller_fee, seller_fee_status)
  values (ad.id, buyer_id, seller_id, owner_id, p_requester_user_id, ad.direction, method.id, config.version, p_wallet_amount, round(p_wallet_amount * ad.rub_per_wallet, 2), 'pending_acceptance', now() + interval '15 minutes', now() + interval '5 minutes', p_wallet_amount, terms, p_idempotency_key, order_fee, case when order_fee > 0 then 'held' else 'none' end)
  returning * into created_order;
  insert into public.p2p_order_events (order_id, actor_user_id, actor_type, event_type, idempotency_key, metadata)
  values (created_order.id, p_requester_user_id, case when p_requester_user_id = buyer_id then 'buyer' else 'seller' end, 'created', 'p2p-order-created:' || created_order.id, jsonb_build_object('direction', ad.direction));
  if ad.direction = 'buy' then
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (seller_id, 'debit', p_wallet_amount + order_fee, '$', 'p2p_escrow_hold', 'p2p_order', created_order.id, next_balance, 'p2p-order-hold:' || created_order.id, jsonb_build_object('order_id', created_order.id, 'escrow', p_wallet_amount, 'seller_fee', order_fee));
  end if;
  insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
  values (created_order.id, 'reserve', p_wallet_amount, fund.wallet_balance, fund.reserved_amount + p_wallet_amount, 'p2p-fund-reserve:' || created_order.id);
  perform public.create_notification_event('p2p.order.created', 'deals', 'p2p_order', created_order.id::text, 'P2P order request', 'Open the order to review the next step.', '/?view=wallet.p2p&order=' || created_order.id::text, array[buyer_id, seller_id], 'p2p-order-created:' || created_order.id, '{}'::jsonb);
  return to_jsonb(created_order);
end;
$$;

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
    update public.p2p_orders set seller_fee_status = case when seller_fee_status = 'held' then 'charged' else seller_fee_status end, status = 'released', released_at = now(), coverage_until = now() + make_interval(days => config.coverage_days), updated_at = now() where id = target.id returning * into target;
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
    update public.p2p_ads set available_amount = least(wallet_amount, available_amount + target.wallet_amount), fee_reserved = fee_reserved + target.seller_fee, status = case when status = 'closed' then 'active' else status end, updated_at = now() where id = target.ad_id;
  else
    select * into wallet from public.wallet_accounts where user_id = target.seller_user_id for update;
    if found then
      next_balance := wallet.balance + target.wallet_amount + target.seller_fee;
      update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = target.seller_user_id;
      insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
      values (target.seller_user_id, 'credit', target.wallet_amount + target.seller_fee, '$', 'p2p_escrow_refund', 'p2p_order', target.id, next_balance, p_idempotency_key || ':wallet', jsonb_build_object('order_id', target.id));
    end if;
  end if;
  update public.p2p_fund_accounts set reserved_amount = greatest(0, reserved_amount - target.fund_reserved_amount), updated_at = now() where id returning * into fund;
  if target.fund_reserved_amount > 0 then
    insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
    values (target.id, 'release', target.fund_reserved_amount, fund.wallet_balance, fund.reserved_amount, p_idempotency_key || ':fund') on conflict do nothing;
  end if;
  update public.p2p_orders set status = 'cancelled', fund_reserved_amount = 0, seller_fee_status = case when seller_fee > 0 then 'returned' else seller_fee_status end, updated_at = now() where id = target.id;
  insert into public.p2p_order_events (order_id, actor_type, event_type, idempotency_key) values (target.id, 'system', 'reserve_released', p_idempotency_key) on conflict do nothing;
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
  if ad.direction = 'sell' and ad.available_amount + ad.fee_reserved > 0 then
    select * into wallet from public.wallet_accounts where user_id = p_seller_user_id for update;
    next_balance := wallet.balance + ad.available_amount + ad.fee_reserved;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_seller_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_seller_user_id, 'credit', ad.available_amount + ad.fee_reserved, '$', 'p2p_escrow_refund', 'p2p_ad', ad.id, next_balance, p_idempotency_key, jsonb_build_object('ad_id', ad.id));
  end if;
  update public.p2p_ads set status = 'cancelled', available_amount = 0, fee_reserved = 0, updated_at = now() where id = ad.id returning * into ad;
  return to_jsonb(ad);
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
  refund_fee numeric := 0;
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
    -- A refund to the seller gives back the fee held for this order; a release to the buyer charges it.
    refund_fee := case when p_outcome = 'refund_seller' and target.seller_fee_status = 'held' then target.seller_fee else 0 end;
    next_balance := recipient_wallet.balance + target.wallet_amount + refund_fee;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = recipient_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
    values (recipient_id, 'credit', target.wallet_amount + refund_fee, '$', case when p_outcome = 'compensate_seller' then 'p2p_compensation' else case when recipient_id = target.buyer_user_id then 'p2p_escrow_release' else 'p2p_escrow_refund' end end,
      'p2p_order', target.id, case when recipient_id = target.buyer_user_id then target.seller_user_id else target.buyer_user_id end, next_balance,
      'p2p-resolution-credit:' || target.id, jsonb_build_object('outcome', p_outcome, 'seller_fee_returned', refund_fee));
  end if;
  if p_outcome = 'refund_seller' then
    select * into fund from public.p2p_fund_accounts where id for update;
    update public.p2p_fund_accounts set reserved_amount = reserved_amount - target.fund_reserved_amount, updated_at = now() where id returning * into fund;
    if target.fund_reserved_amount > 0 then insert into public.p2p_fund_ledger (order_id, operation_type, amount, balance_after, reserved_after, idempotency_key)
      values (target.id, 'release', target.fund_reserved_amount, fund.wallet_balance, fund.reserved_amount, 'p2p-resolution-fund-release:' || target.id); end if;
  end if;
  update public.p2p_orders
  set seller_fee_status = case when seller_fee_status = 'held' and p_outcome in ('release_to_buyer', 'dismiss') then 'charged' when seller_fee_status = 'held' and p_outcome = 'refund_seller' then 'returned' else seller_fee_status end,
      status = case when p_outcome = 'release_to_buyer' or (p_outcome = 'dismiss' and not dispute.is_late) then 'released' else 'resolved' end,
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

create or replace function public.create_notification_event(
  p_event_type text,
  p_category text,
  p_source_type text,
  p_source_id text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_recipient_user_ids uuid[],
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.p2p_orders%rowtype;
  v_actor uuid;
  v_key text;
  v_recipient uuid;
  v_copy jsonb;
  v_last uuid;
begin
  if p_event_type not like 'p2p.order.%' or p_source_type <> 'p2p_order' or p_source_id is null
     or p_source_id !~ '^[0-9a-fA-F-]{36}$' then
    return public.create_notification_event_raw(p_event_type, p_category, p_source_type, p_source_id, p_title, p_body, p_deep_link, p_recipient_user_ids, p_idempotency_key, p_metadata, false);
  end if;

  select * into v_order from public.p2p_orders where id = p_source_id::uuid;
  if not found then
    return public.create_notification_event_raw(p_event_type, p_category, p_source_type, p_source_id, p_title, p_body, p_deep_link, p_recipient_user_ids, p_idempotency_key, p_metadata, false);
  end if;

  -- Who just acted is not told about their own action.
  if p_event_type = 'p2p.order.created' then
    v_actor := v_order.requester_user_id;
  elsif p_idempotency_key like 'p2p-action:%' then
    select actor_user_id into v_actor from public.p2p_order_events
    where order_id = v_order.id and idempotency_key = substr(p_idempotency_key, length('p2p-action:') + 1);
  elsif p_idempotency_key like 'p2p-message:%' then
    select sender_user_id into v_actor from public.p2p_order_messages
    where order_id = v_order.id and id::text = substr(p_idempotency_key, length('p2p-message:') + 1);
  end if;

  foreach v_recipient in array p_recipient_user_ids loop
    continue when v_recipient is null or v_recipient is not distinct from v_actor;
    v_copy := public.p2p_notification_copy(
      p_event_type,
      case when v_recipient = v_order.buyer_user_id then 'buyer' else 'seller' end,
      v_order.wallet_amount, v_order.rub_amount
    );
    v_last := public.create_notification_event_raw(
      p_event_type, 'p2p', p_source_type, p_source_id,
      v_copy->'en'->>'title', v_copy->'en'->>'body', p_deep_link,
      array[v_recipient], p_idempotency_key || ':' || v_recipient::text,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('copy', v_copy, 'order_id', v_order.id),
      true
    );
  end loop;
  return v_last;
end;
$$;
