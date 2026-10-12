-- Humanity confirmation (level 2): vendor-neutral state, attempts and webhook events.
-- Only the verification flow (service role) writes these tables. No video, photo, audio, embedding
-- or document data is stored here: only the provider result, an opaque provider session id,
-- a scenario version and timestamps.

alter table public.humanity_verifications
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'review_required', 'rejected', 'expired')),
  add column if not exists provider_subject_id text,
  add column if not exists reviewed_at timestamptz;

create table if not exists public.humanity_verification_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('didit', 'sumsub', 'manual')),
  provider_session_id text not null,
  status text not null default 'created' check (status in ('created', 'pending', 'verified', 'review_required', 'rejected', 'expired')),
  consent_version text not null,
  scenario_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_session_id)
);

create index if not exists humanity_verification_attempts_user_created_idx
  on public.humanity_verification_attempts (user_id, created_at desc);

create table if not exists public.humanity_provider_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  attempt_id bigint references public.humanity_verification_attempts(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received',
  unique (provider, provider_event_id)
);

create index if not exists humanity_provider_events_attempt_idx
  on public.humanity_provider_events (attempt_id);

alter table public.humanity_verification_attempts enable row level security;
alter table public.humanity_provider_events enable row level security;
revoke all on public.humanity_verification_attempts from public, anon, authenticated;
revoke all on public.humanity_provider_events from public, anon, authenticated;
grant select, insert, update on public.humanity_verification_attempts to service_role;
grant select, insert, update on public.humanity_provider_events to service_role;

-- Applies one provider result atomically and idempotently. A verified level is never lowered by a
-- later failed attempt; only an approved result raises the level to 2.
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
