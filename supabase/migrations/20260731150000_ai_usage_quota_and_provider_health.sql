create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  period_day date not null,
  message_count integer not null default 0 check (message_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, capability, period_day)
);

create table if not exists public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  period_month date not null,
  message_count integer not null default 0 check (message_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, capability, period_month)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  provider text,
  model text,
  route text not null default 'system',
  status text not null check (status in ('quota_blocked', 'rate_limited', 'concurrency_blocked', 'accepted', 'failed')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  policy_version text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_capability_created_idx
  on public.ai_usage_events (capability, created_at desc);

create table if not exists public.ai_provider_health (
  provider text primary key check (provider in ('gemini', 'groq')),
  model text not null,
  enabled boolean not null default true,
  blocked_until timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_failure_code text,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.ai_provider_health (provider, model)
values
  ('gemini', 'gemini-2.0-flash'),
  ('groq', 'llama-3.3-70b-versatile')
on conflict (provider) do update
set model = excluded.model;

create table if not exists public.ai_request_guards (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0 check (window_count >= 0),
  active_count integer not null default 0 check (active_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, capability)
);

alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_monthly enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_provider_health enable row level security;
alter table public.ai_request_guards enable row level security;

revoke all on public.ai_usage_daily from anon, authenticated;
revoke all on public.ai_usage_monthly from anon, authenticated;
revoke all on public.ai_usage_events from anon, authenticated;
revoke all on public.ai_provider_health from anon, authenticated;
revoke all on public.ai_request_guards from anon, authenticated;
grant select, insert, update, delete on public.ai_usage_daily to service_role;
grant select, insert, update, delete on public.ai_usage_monthly to service_role;
grant select, insert, update, delete on public.ai_usage_events to service_role;
grant select, insert, update, delete on public.ai_provider_health to service_role;
grant select, insert, update, delete on public.ai_request_guards to service_role;

create or replace function public.reserve_ai_chat_message(
  p_user_id uuid,
  p_capability text default 'chat.general',
  p_day_limit integer default 20,
  p_month_limit integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_day_count integer;
  v_month_count integer;
begin
  if p_user_id is null or p_capability is null or length(trim(p_capability)) = 0 then
    raise exception 'AI quota identity is required';
  end if;
  if p_day_limit < 1 or p_month_limit < 1 then
    raise exception 'AI quota limits must be positive';
  end if;

  insert into public.ai_usage_daily (user_id, capability, period_day)
  values (p_user_id, p_capability, v_day)
  on conflict (user_id, capability, period_day) do nothing;

  insert into public.ai_usage_monthly (user_id, capability, period_month)
  values (p_user_id, p_capability, v_month)
  on conflict (user_id, capability, period_month) do nothing;

  select message_count into v_day_count
  from public.ai_usage_daily
  where user_id = p_user_id and capability = p_capability and period_day = v_day
  for update;

  select message_count into v_month_count
  from public.ai_usage_monthly
  where user_id = p_user_id and capability = p_capability and period_month = v_month
  for update;

  if v_day_count >= p_day_limit or v_month_count >= p_month_limit then
    return jsonb_build_object(
      'allowed', false,
      'dayCount', v_day_count,
      'monthCount', v_month_count,
      'dayRemaining', greatest(p_day_limit - v_day_count, 0),
      'monthRemaining', greatest(p_month_limit - v_month_count, 0),
      'dayLimit', p_day_limit,
      'monthLimit', p_month_limit,
      'dayKey', v_day,
      'monthKey', v_month
    );
  end if;

  update public.ai_usage_daily
  set message_count = message_count + 1, updated_at = now()
  where user_id = p_user_id and capability = p_capability and period_day = v_day;

  update public.ai_usage_monthly
  set message_count = message_count + 1, updated_at = now()
  where user_id = p_user_id and capability = p_capability and period_month = v_month;

  return jsonb_build_object(
    'allowed', true,
    'dayCount', v_day_count + 1,
    'monthCount', v_month_count + 1,
    'dayRemaining', greatest(p_day_limit - v_day_count - 1, 0),
    'monthRemaining', greatest(p_month_limit - v_month_count - 1, 0),
    'dayLimit', p_day_limit,
    'monthLimit', p_month_limit,
    'dayKey', v_day,
    'monthKey', v_month
  );
end;
$$;

revoke all on function public.reserve_ai_chat_message(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_chat_message(uuid, text, integer, integer) to service_role;

create or replace function public.acquire_ai_request(
  p_user_id uuid,
  p_capability text default 'chat.general',
  p_rate_limit integer default 6,
  p_window_seconds integer default 60,
  p_max_concurrent integer default 1,
  p_stale_after_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_started_at timestamptz;
  v_window_count integer;
  v_active_count integer;
  v_retry_after integer := 1;
begin
  if p_user_id is null or p_capability is null or p_rate_limit < 1 or p_window_seconds < 1 or p_max_concurrent < 1 then
    raise exception 'AI request guard parameters are invalid';
  end if;

  insert into public.ai_request_guards (user_id, capability)
  values (p_user_id, p_capability)
  on conflict (user_id, capability) do nothing;

  select window_started_at, window_count, active_count
  into v_window_started_at, v_window_count, v_active_count
  from public.ai_request_guards
  where user_id = p_user_id and capability = p_capability
  for update;

  if v_active_count > 0 and v_now - v_window_started_at > make_interval(secs => p_stale_after_seconds) then
    v_active_count := 0;
  end if;

  if v_active_count >= p_max_concurrent then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'concurrency',
      'retryAfterSeconds', 1,
      'activeCount', v_active_count,
      'windowCount', v_window_count
    );
  end if;

  if v_now - v_window_started_at >= make_interval(secs => p_window_seconds) then
    v_window_started_at := v_now;
    v_window_count := 0;
  end if;

  if v_window_count >= p_rate_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer);
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'retryAfterSeconds', v_retry_after,
      'activeCount', v_active_count,
      'windowCount', v_window_count
    );
  end if;

  update public.ai_request_guards
  set window_started_at = v_window_started_at,
      window_count = v_window_count + 1,
      active_count = v_active_count + 1,
      updated_at = v_now
  where user_id = p_user_id and capability = p_capability;

  return jsonb_build_object(
    'allowed', true,
    'retryAfterSeconds', 0,
    'activeCount', v_active_count + 1,
    'windowCount', v_window_count + 1
  );
end;
$$;

revoke all on function public.acquire_ai_request(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.acquire_ai_request(uuid, text, integer, integer, integer, integer) to service_role;

create or replace function public.release_ai_request(
  p_user_id uuid,
  p_capability text default 'chat.general'
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_request_guards
  set active_count = greatest(active_count - 1, 0), updated_at = now()
  where user_id = p_user_id and capability = p_capability;
$$;

revoke all on function public.release_ai_request(uuid, text) from public, anon, authenticated;
grant execute on function public.release_ai_request(uuid, text) to service_role;

create or replace function public.mark_ai_provider_failure(
  p_provider text,
  p_failure_code text,
  p_blocked_until timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_provider_health
  set failure_count = failure_count + 1,
      last_failure_code = p_failure_code,
      last_failure_at = now(),
      blocked_until = p_blocked_until,
      updated_at = now()
  where provider = p_provider;
$$;

revoke all on function public.mark_ai_provider_failure(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_ai_provider_failure(text, text, timestamptz) to service_role;

create or replace function public.mark_ai_provider_success(p_provider text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_provider_health
  set failure_count = 0,
      last_failure_code = null,
      last_failure_at = null,
      blocked_until = null,
      updated_at = now()
  where provider = p_provider;
$$;

revoke all on function public.mark_ai_provider_success(text) from public, anon, authenticated;
grant execute on function public.mark_ai_provider_success(text) to service_role;
