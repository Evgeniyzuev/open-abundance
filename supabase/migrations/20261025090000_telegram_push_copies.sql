-- Every push also goes to the person's Telegram through the Open Abundance bot.
--
-- Web push reaches very few people (one enabled device in the pilot), while most people have a linked Telegram
-- account. A notification that queues a push (p_push) now also queues one Telegram copy per recipient with a linked
-- Telegram account and that category's push switched on. The app sends the queue (POST
-- /api/internal/notifications/telegram, called every minute by pg_cron only while something waits), in the person's
-- language with an "Open" button. People who never started the bot are marked "blocked" and not retried.

create table if not exists public.telegram_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null unique references public.notification_recipients(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'blocked', 'failed', 'cancelled')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_notification_deliveries_queued_idx
  on public.telegram_notification_deliveries (created_at) where status = 'queued';

alter table public.telegram_notification_deliveries enable row level security;
revoke all on public.telegram_notification_deliveries from public, anon, authenticated;
grant all on public.telegram_notification_deliveries to service_role;

-- Security definer: create_notification_event_raw runs as its caller, who cannot write this table.
create or replace function public.enqueue_telegram_notification_copies(p_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.telegram_notification_deliveries (recipient_id)
  select recipient.id
  from public.notification_recipients recipient
  join public.notification_events event on event.id = recipient.event_id
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
   and preference.category = event.category
  where recipient.event_id = p_event_id
    and coalesce(preference.push_enabled, true)
    and exists (select 1 from public.telegram_accounts account where account.user_id = recipient.user_id)
  on conflict (recipient_id) do nothing;
$$;

revoke all on function public.enqueue_telegram_notification_copies(uuid) from public, anon, authenticated;

-- The function body from 20261011240000_p2p_push_category, plus the Telegram copy.
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

    perform public.enqueue_telegram_notification_copies(created_event_id);
  end if;

  return created_event_id;
end;
$$;

-- Claims up to p_limit queued copies with the person's Telegram id and the text in their language (same language
-- rule as claim_notification_deliveries). Copies older than a day, or whose category was switched off or whose source
-- is no longer accessible, are cancelled instead of sent.
create or replace function public.claim_telegram_notification_copies(p_limit integer default 50)
returns table (
  delivery_id uuid,
  telegram_id bigint,
  locale text,
  event_type text,
  deep_link text,
  title text,
  body text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.telegram_notification_deliveries
  set status = 'queued', claimed_at = null, updated_at = now(), last_error = 'Recovered after processing timeout'
  where status = 'processing' and claimed_at < now() - interval '10 minutes';

  update public.telegram_notification_deliveries delivery
  set status = 'cancelled', updated_at = now(), last_error = 'Too old, preference off or source not accessible'
  from public.notification_recipients recipient, public.notification_events event
  where delivery.status = 'queued'
    and recipient.id = delivery.recipient_id
    and event.id = recipient.event_id
    and (delivery.created_at < now() - interval '1 day'
      or not public.notification_source_accessible(event.id, recipient.user_id)
      or exists (
        select 1 from public.notification_preferences disabled
        where disabled.user_id = recipient.user_id
          and disabled.category = event.category
          and disabled.push_enabled = false
      ));

  return query
  with claimed as (
    select delivery.id
    from public.telegram_notification_deliveries delivery
    where delivery.status = 'queued'
    order by delivery.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), updated as (
    update public.telegram_notification_deliveries delivery
    set status = 'processing', attempts = delivery.attempts + 1, claimed_at = now(), updated_at = now()
    from claimed
    where delivery.id = claimed.id
    returning delivery.id, delivery.recipient_id
  )
  select updated.id,
         account.telegram_id,
         lang.code,
         event.event_type,
         event.deep_link,
         coalesce(event.metadata->'copy'->lang.code->>'title', event.metadata->'copy'->'en'->>'title', event.title),
         coalesce(event.metadata->'copy'->lang.code->>'body', event.metadata->'copy'->'en'->>'body', event.body)
  from updated
  join public.notification_recipients recipient on recipient.id = updated.recipient_id
  join public.notification_events event on event.id = recipient.event_id
  left join lateral (
    select linked.telegram_id from public.telegram_accounts linked
    where linked.user_id = recipient.user_id
    order by linked.updated_at desc nulls last
    limit 1
  ) account on true
  left join public.user_profiles profile on profile.user_id = recipient.user_id
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
   and preference.category = event.category
  cross join lateral (select case when coalesce(profile.default_locale, preference.locale, 'en') in ('ru', 'es', 'zh', 'hi', 'ar') then coalesce(profile.default_locale, preference.locale, 'en') else 'en' end as code) lang;
end;
$$;

revoke all on function public.claim_telegram_notification_copies(integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_notification_copies(integer) to service_role;

-- Calls the app only while copies wait, with the same Vault secrets as the coordinator nudges.
create or replace function public.dispatch_telegram_notification_copies()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_secret text;
  v_request_id bigint;
begin
  if not exists (select 1 from public.telegram_notification_deliveries where status = 'queued') then
    return null;
  end if;

  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;
  if v_project_url is null or v_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/notifications/telegram',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ton-scanner-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_telegram_notification_copies() from public, anon, authenticated;
grant execute on function public.dispatch_telegram_notification_copies() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-telegram-notifications') then
    perform cron.unschedule('open-abundance-telegram-notifications');
  end if;
  perform cron.schedule(
    'open-abundance-telegram-notifications',
    '* * * * *',
    'select public.dispatch_telegram_notification_copies();'
  );
end;
$$;
