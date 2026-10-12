-- P2P: the project fee is 1% of the Wallet amount, kept when the escrow is released to the buyer.
--
-- The buyer pays RUB for the full amount and is credited the amount minus the fee; the seller's escrow already
-- left their Wallet, so the fee simply stays with the project. It applies to the normal release (the seller
-- confirms receipt) and to an operator's "release to buyer" decision, never to refunds to the seller.
-- The configured percentage is read from the order's risk-config version (pilot_fee_percent). No P2P order
-- existed when this was set, so the active version is updated in place.

update public.p2p_risk_configs set pilot_fee_percent = 1 where version = 'p2p-pilot-v1';

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
  release_fee numeric := 0;
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
    -- The project fee (config.pilot_fee_percent) is kept out of the buyer's credit; the seller's escrow already left their Wallet.
    release_fee := round(target.wallet_amount * config.pilot_fee_percent / 100, 2);
    next_balance := buyer_wallet.balance + target.wallet_amount - release_fee;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = target.buyer_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
    values (target.buyer_user_id, 'credit', target.wallet_amount - release_fee, '$', 'p2p_escrow_release', 'p2p_order', target.id, target.seller_user_id, next_balance, 'p2p-order-release:' || target.id, jsonb_build_object('order_id', target.id, 'gross_amount', target.wallet_amount, 'project_fee', release_fee, 'fee_percent', config.pilot_fee_percent));
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
  release_fee numeric := 0;
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
    -- Releasing the escrow to the buyer carries the project fee; refunds and compensation to the seller do not.
    release_fee := case when recipient_id = target.buyer_user_id then round(target.wallet_amount * config.pilot_fee_percent / 100, 2) else 0 end;
    next_balance := recipient_wallet.balance + target.wallet_amount - release_fee;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = recipient_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, counterparty_user_id, balance_after, idempotency_key, metadata)
    values (recipient_id, 'credit', target.wallet_amount - release_fee, '$', case when p_outcome = 'compensate_seller' then 'p2p_compensation' else case when recipient_id = target.buyer_user_id then 'p2p_escrow_release' else 'p2p_escrow_refund' end end,
      'p2p_order', target.id, case when recipient_id = target.buyer_user_id then target.seller_user_id else target.buyer_user_id end, next_balance,
      'p2p-resolution-credit:' || target.id, jsonb_build_object('outcome', p_outcome, 'gross_amount', target.wallet_amount, 'project_fee', release_fee, 'fee_percent', config.pilot_fee_percent));
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
  v_wallet numeric;
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

  -- "Credited" names the amount the buyer actually received, after the project fee.
  v_wallet := v_order.wallet_amount;
  if p_event_type = 'p2p.order.confirm_received' then
    select v_order.wallet_amount - round(v_order.wallet_amount * c.pilot_fee_percent / 100, 2) into v_wallet
    from public.p2p_risk_configs c where c.version = v_order.config_version;
  end if;

  foreach v_recipient in array p_recipient_user_ids loop
    continue when v_recipient is null or v_recipient is not distinct from v_actor;
    v_copy := public.p2p_notification_copy(
      p_event_type,
      case when v_recipient = v_order.buyer_user_id then 'buyer' else 'seller' end,
      v_wallet, v_order.rub_amount
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
