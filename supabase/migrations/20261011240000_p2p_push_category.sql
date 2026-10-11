-- P2P deal pushes: their own "p2p" category and concrete text instead of a generic "view update".
--
-- Every other notification-center event stays in-app only (see 20261011210000). Events whose type
-- starts with "p2p.order." are re-addressed here: category p2p, one event per recipient (never the
-- person who just acted), a title and body in Russian and English that name the amounts and the next
-- step, and a push delivery. The push locale comes from the profile language.

alter table public.notification_events drop constraint if exists notification_events_category_check;
alter table public.notification_events add constraint notification_events_category_check
  check (category in ('deals', 'disputes', 'wallet', 'rewards', 'team', 'confirmations', 'reminders', 'social', 'p2p', 'system'));
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('deals', 'disputes', 'wallet', 'rewards', 'team', 'confirmations', 'reminders', 'social', 'p2p', 'system'));
-- In-app history of deals cannot be switched off; the push can.
alter table public.notification_preferences drop constraint if exists notification_preferences_required_history_check;
alter table public.notification_preferences add constraint notification_preferences_required_history_check
  check (category not in ('deals', 'disputes', 'wallet', 'rewards', 'system', 'p2p') or in_app_enabled);

-- The original function body, with an explicit switch for queueing a push.
create or replace function public.create_notification_event_raw(
  p_event_type text,
  p_category text,
  p_source_type text,
  p_source_id text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_recipient_user_ids uuid[],
  p_idempotency_key text,
  p_metadata jsonb,
  p_push boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_event_id uuid;
begin
  if coalesce(array_length(p_recipient_user_ids, 1), 0) = 0 then
    raise exception 'At least one notification recipient is required.';
  end if;

  insert into public.notification_events (
    event_type, category, source_type, source_id, title, body, deep_link, metadata, idempotency_key
  ) values (
    p_event_type, p_category, p_source_type, nullif(btrim(p_source_id), ''),
    p_title, p_body, p_deep_link, coalesce(p_metadata, '{}'::jsonb), p_idempotency_key
  )
  on conflict (idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into created_event_id;

  insert into public.notification_recipients (event_id, user_id)
  select created_event_id, recipient_user_id
  from unnest(p_recipient_user_ids) recipient_user_id
  where recipient_user_id is not null
  on conflict (event_id, user_id) do nothing;

  if p_push then
    insert into public.notification_deliveries (recipient_id, subscription_id)
    select recipient.id, subscription.id
    from public.notification_recipients recipient
    join public.notification_events event on event.id = recipient.event_id
    join public.push_subscriptions subscription
      on subscription.owner_key = 'user:' || recipient.user_id::text
     and subscription.enabled
    left join public.notification_preferences preference
      on preference.user_id = recipient.user_id
     and preference.category = event.category
    where recipient.event_id = created_event_id
      and coalesce(preference.push_enabled, true)
    on conflict (recipient_id, subscription_id) do nothing;
  end if;

  return created_event_id;
end;
$$;

create or replace function public.p2p_fmt_amount(p_amount numeric, p_ru boolean)
returns text
language sql immutable set search_path = ''
as $$
  select case when p_ru then replace(s, '.', ',') else s end
  from (select case when p_amount = trunc(p_amount) then trunc(p_amount)::text else to_char(p_amount, 'FM999999990.00') end as s) formatted;
$$;

-- Concrete copy for one deal event and one recipient role (buyer or seller), in both languages.
create or replace function public.p2p_notification_copy(p_event text, p_role text, p_wallet numeric, p_rub numeric)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  w_ru text := public.p2p_fmt_amount(p_wallet, true);
  r_ru text := public.p2p_fmt_amount(p_rub, true);
  w_en text := public.p2p_fmt_amount(p_wallet, false);
  r_en text := public.p2p_fmt_amount(p_rub, false);
  kind text := regexp_replace(p_event, '^p2p\.order\.', '');
begin
  return case kind
    when 'created' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Новая заявка P2P: ' || w_ru || ' $ за ' || r_ru || ' ₽', 'body', 'Откройте сделку, чтобы принять или отклонить заявку.'),
      'en', jsonb_build_object('title', 'New P2P request: $' || w_en || ' for ' || r_en || ' RUB', 'body', 'Open the deal to accept or decline the request.'))
    when 'accept_order' then case when p_role = 'buyer' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Заявка принята: переведите ' || r_ru || ' ₽', 'body', 'На оплату 15 минут. Реквизиты продавца в сделке.'),
      'en', jsonb_build_object('title', 'Request accepted: send ' || r_en || ' RUB', 'body', 'You have 15 minutes to pay. The seller''s details are in the deal.'))
    else jsonb_build_object(
      'ru', jsonb_build_object('title', 'Заявка принята', 'body', 'Ждите перевод ' || r_ru || ' ₽ от покупателя. Резерв ' || w_ru || ' $ сохранён.'),
      'en', jsonb_build_object('title', 'Request accepted', 'body', 'Wait for ' || r_en || ' RUB from the buyer. $' || w_en || ' stays reserved.')) end
    when 'reject_order' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Заявка отклонена', 'body', 'Сделка на ' || w_ru || ' $ не состоится, резерв возвращён.'),
      'en', jsonb_build_object('title', 'Request declined', 'body', 'The $' || w_en || ' deal will not happen; the reserve is released.'))
    when 'mark_paid' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Покупатель оплатил ' || r_ru || ' ₽', 'body', 'Проверьте поступление в банке и подтвердите в течение 30 минут.'),
      'en', jsonb_build_object('title', 'The buyer paid ' || r_en || ' RUB', 'body', 'Check your bank and confirm within 30 minutes.'))
    when 'confirm_received' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Продавец подтвердил оплату', 'body', w_ru || ' $ зачислены в ваш Wallet.'),
      'en', jsonb_build_object('title', 'The seller confirmed payment', 'body', '$' || w_en || ' was credited to your Wallet.'))
    when 'cancel' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Сделка отменена', 'body', 'Сделка на ' || w_ru || ' $ отменена, резерв возвращён.'),
      'en', jsonb_build_object('title', 'Deal cancelled', 'body', 'The $' || w_en || ' deal was cancelled and the reserve is released.'))
    when 'open_dispute' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Открыт спор по сделке', 'body', 'Сделка на ' || w_ru || ' $ передана на разбор. Добавьте доказательства в сделке.'),
      'en', jsonb_build_object('title', 'A dispute was opened', 'body', 'The $' || w_en || ' deal is under review. Add your evidence in the deal.'))
    when 'appeal' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Подана апелляция', 'body', 'Решение по сделке на ' || w_ru || ' $ будет проверено ещё раз.'),
      'en', jsonb_build_object('title', 'An appeal was filed', 'body', 'The decision on the $' || w_en || ' deal will be reviewed again.'))
    when 'payment_timeout' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Время на оплату истекло', 'body', 'Сделка на ' || w_ru || ' $ отменена, резерв возвращён.'),
      'en', jsonb_build_object('title', 'Payment time ran out', 'body', 'The $' || w_en || ' deal was cancelled and the reserve is released.'))
    when 'review_required' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Сделка передана на проверку', 'body', 'Поступление не подтверждено за 30 минут. Резерв ' || w_ru || ' $ сохранён до решения.'),
      'en', jsonb_build_object('title', 'The deal needs review', 'body', 'Receipt was not confirmed in 30 minutes. $' || w_en || ' stays reserved until a decision.'))
    when 'dispute_resolved' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Спор решён', 'body', 'Откройте сделку на ' || w_ru || ' $, чтобы увидеть решение.'),
      'en', jsonb_build_object('title', 'The dispute is resolved', 'body', 'Open the $' || w_en || ' deal to see the decision.'))
    when 'resolution_corrected' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Решение по спору пересмотрено', 'body', 'Откройте сделку на ' || w_ru || ' $, чтобы увидеть изменения.'),
      'en', jsonb_build_object('title', 'The decision was revised', 'body', 'Open the $' || w_en || ' deal to see what changed.'))
    when 'message' then jsonb_build_object(
      'ru', jsonb_build_object('title', 'Новое сообщение в сделке на ' || w_ru || ' $', 'body', 'Откройте сделку, чтобы прочитать.'),
      'en', jsonb_build_object('title', 'New message in the $' || w_en || ' deal', 'body', 'Open the deal to read it.'))
    else jsonb_build_object(
      'ru', jsonb_build_object('title', 'Сделка P2P обновлена', 'body', 'Сделка на ' || w_ru || ' $ изменила статус. Откройте её.'),
      'en', jsonb_build_object('title', 'P2P deal updated', 'body', 'The $' || w_en || ' deal changed status. Open it.'))
  end;
end;
$$;

-- Same signature as before. Non-P2P events behave as they did (in-app only); P2P events get the category,
-- per-recipient concrete copy and a push.
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

-- The delivery claim now also returns the concrete title and body in the recipient's language.
drop function if exists public.claim_notification_deliveries(integer);
create function public.claim_notification_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  locale text,
  event_type text,
  category text,
  deep_link text,
  title text,
  body text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries
  set status = 'queued',
      claimed_at = null,
      available_at = now(),
      updated_at = now(),
      last_error = 'Recovered after processing timeout'
  where status = 'processing'
    and claimed_at < now() - interval '10 minutes';

  return query
  with claimed as (
    select delivery.id
    from public.notification_deliveries delivery
    join public.notification_recipients recipient on recipient.id = delivery.recipient_id
    join public.notification_events event on event.id = recipient.event_id
    join public.push_subscriptions subscription on subscription.id = delivery.subscription_id
    left join public.notification_preferences preference
      on preference.user_id = recipient.user_id
     and preference.category = event.category
    where delivery.status = 'queued'
      and delivery.available_at <= now()
      and subscription.enabled
      and subscription.owner_key = 'user:' || recipient.user_id::text
      and coalesce(preference.push_enabled, true)
      and public.notification_source_accessible(event.id, recipient.user_id)
    order by delivery.available_at, delivery.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update of delivery skip locked
  ), updated as (
    update public.notification_deliveries delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        claimed_at = now(),
        updated_at = now()
    from claimed
    where delivery.id = claimed.id
    returning delivery.*
  )
  select updated.id,
         subscription.id,
         subscription.endpoint,
         subscription.p256dh,
         subscription.auth,
         lang.code,
         event.event_type,
         event.category,
         event.deep_link,
         coalesce(event.metadata->'copy'->lang.code->>'title', event.title),
         coalesce(event.metadata->'copy'->lang.code->>'body', event.body)
  from updated
  join public.notification_recipients recipient on recipient.id = updated.recipient_id
  join public.notification_events event on event.id = recipient.event_id
  join public.push_subscriptions subscription on subscription.id = updated.subscription_id
  left join public.user_profiles profile on profile.user_id = recipient.user_id
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
   and preference.category = event.category
  cross join lateral (select case when coalesce(profile.default_locale, preference.locale, 'en') = 'ru' then 'ru' else 'en' end as code) lang;

  update public.notification_deliveries delivery
  set status = 'cancelled', updated_at = now(), last_error = 'Subscription owner or preference changed'
  from public.notification_recipients recipient,
       public.notification_events event,
       public.push_subscriptions subscription
  where delivery.status = 'queued'
    and delivery.recipient_id = recipient.id
    and event.id = recipient.event_id
    and subscription.id = delivery.subscription_id
    and (subscription.enabled = false
      or subscription.owner_key <> 'user:' || recipient.user_id::text
      or not public.notification_source_accessible(event.id, recipient.user_id)
      or exists (
        select 1 from public.notification_preferences disabled
        where disabled.user_id = recipient.user_id
          and disabled.category = event.category
          and disabled.push_enabled = false
      ));
end;
$$;

revoke all on function public.create_notification_event_raw(text, text, text, text, text, text, text, uuid[], text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.p2p_fmt_amount(numeric, boolean) from public, anon, authenticated;
revoke all on function public.p2p_notification_copy(text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.create_notification_event_raw(text, text, text, text, text, text, text, uuid[], text, jsonb, boolean) to service_role;
grant execute on function public.p2p_fmt_amount(numeric, boolean) to service_role;
grant execute on function public.p2p_notification_copy(text, text, numeric, numeric) to service_role;
grant execute on function public.claim_notification_deliveries(integer) to service_role;
