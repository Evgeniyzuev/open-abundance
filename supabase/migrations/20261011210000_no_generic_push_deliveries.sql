-- Stop the generic "Open the app to view an update" push.
--
-- Every notification-center event (daily Core accrual, wallet movements, treasury digests...) used to
-- queue a web push with the same text. Those pushes are removed; the events stay in the in-app
-- notification list. Scheduled reminders (today's plan, install ping) use reminder_jobs and are
-- not affected.

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

  return created_event_id;
end;
$$;

-- Anything still waiting to be pushed is dropped.
update public.notification_deliveries
set status = 'cancelled', last_error = 'Generic push removed', updated_at = now()
where status in ('queued', 'processing');
