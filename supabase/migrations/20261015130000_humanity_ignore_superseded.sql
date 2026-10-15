-- A new verification attempt cancels the previous one. Results that arrive later for an attempt
-- that was superseded (status 'expired' in our records) are recorded but no longer change the
-- user's confirmation state, so only the newest attempt decides.

create or replace function public.apply_humanity_result(
  p_provider text,
  p_session_id text,
  p_event_id text,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.humanity_verification_attempts%rowtype;
  event_row_id bigint;
  mapped text;
begin
  select * into attempt
  from public.humanity_verification_attempts
  where provider = p_provider and provider_session_id = p_session_id
  for update;

  if not found then
    return 'unknown_attempt';
  end if;

  insert into public.humanity_provider_events (provider, provider_event_id, attempt_id)
  values (p_provider, p_event_id, attempt.id)
  on conflict (provider, provider_event_id) do nothing
  returning id into event_row_id;

  if event_row_id is null then
    return 'duplicate';
  end if;

  mapped := case p_status
    when 'Approved' then 'verified'
    when 'In Review' then 'review_required'
    when 'Declined' then 'rejected'
    when 'Abandoned' then 'expired'
    when 'Expired' then 'expired'
    else 'pending'
  end;

  -- Superseded attempt: keep the event for the record, change nothing else.
  if attempt.status = 'expired' and mapped <> 'expired' then
    update public.humanity_provider_events
    set processed_at = now(), processing_status = 'superseded'
    where id = event_row_id;
    return 'superseded';
  end if;

  update public.humanity_verification_attempts
  set status = mapped, updated_at = now()
  where id = attempt.id;

  if mapped = 'verified' then
    insert into public.humanity_verifications (user_id, humanity_level, verified_at, method, verification_status, provider_subject_id, updated_at)
    values (attempt.user_id, 2, now(), p_provider, 'verified', p_session_id, now())
    on conflict (user_id) do update
    set humanity_level = greatest(public.humanity_verifications.humanity_level, 2),
        verified_at = now(),
        method = excluded.method,
        verification_status = 'verified',
        provider_subject_id = excluded.provider_subject_id,
        updated_at = now();
  elsif mapped in ('review_required', 'rejected', 'pending') then
    insert into public.humanity_verifications (user_id, humanity_level, method, verification_status, updated_at)
    values (attempt.user_id, 0, p_provider, mapped, now())
    on conflict (user_id) do update
    set verification_status = case
          when public.humanity_verifications.verification_status = 'verified' then 'verified'
          else excluded.verification_status
        end,
        updated_at = now();
  end if;

  update public.humanity_provider_events
  set processed_at = now(), processing_status = 'processed'
  where id = event_row_id;

  return mapped;
end;
$$;

revoke all on function public.apply_humanity_result(text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_humanity_result(text, text, text, text) to service_role;
