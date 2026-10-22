-- Push texts in every supported language.
--
-- The delivery claim picked the text language as ru or en only. It now takes the person's language from the profile
-- (ru, es, zh, hi, ar) and reads the matching text from the event's metadata.copy; a language without text falls back
-- to the English text, then to the event title and body. Nothing else about claiming changes.

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
         coalesce(event.metadata->'copy'->lang.code->>'title', event.metadata->'copy'->'en'->>'title', event.title),
         coalesce(event.metadata->'copy'->lang.code->>'body', event.metadata->'copy'->'en'->>'body', event.body)
  from updated
  join public.notification_recipients recipient on recipient.id = updated.recipient_id
  join public.notification_events event on event.id = recipient.event_id
  join public.push_subscriptions subscription on subscription.id = updated.subscription_id
  left join public.user_profiles profile on profile.user_id = recipient.user_id
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
   and preference.category = event.category
  cross join lateral (select case when coalesce(profile.default_locale, preference.locale, 'en') in ('ru', 'es', 'zh', 'hi', 'ar') then coalesce(profile.default_locale, preference.locale, 'en') else 'en' end as code) lang;

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

revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;
