-- Founder decision 2026-11-14: «Просьба через Нову» with double consent. A person tells Nova what they need (advice,
-- help, a partner, a talk). Nova passes the request on without a name. A helper answers «Могу» (first consent), the
-- requester confirms the connection (second consent), and only then the two talk, still through Nova and without
-- names. Names appear only when both chose to show them. Either side can leave at any step without explaining.
-- All reads and writes go through the app's API with the service role; there are no client policies.
begin;

create table if not exists public.nova_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('advice', 'help', 'partner', 'talk')),
  body text not null check (char_length(body) between 3 and 400),
  status text not null default 'open' check (status in ('open', 'matched', 'closed', 'cancelled')),
  helper_user_id uuid references auth.users (id) on delete set null,
  requester_reveal boolean not null default false,
  helper_reveal boolean not null default false,
  helped boolean,
  closed_by text check (closed_by in ('requester', 'helper')),
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  closed_at timestamptz,
  check (helper_user_id is null or helper_user_id <> requester_user_id)
);
create index if not exists nova_requests_requester on public.nova_requests (requester_user_id, created_at desc);
create index if not exists nova_requests_helper on public.nova_requests (helper_user_id, created_at desc);
create index if not exists nova_requests_open on public.nova_requests (created_at desc) where status = 'open';

create table if not exists public.nova_request_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.nova_requests (id) on delete cascade,
  helper_user_id uuid not null references auth.users (id) on delete cascade,
  -- asked: Nova passed the request to this person; ready: the person said «Могу»; passed: «Не сейчас»;
  -- connected: the requester confirmed; released: the requester chose someone else or the request ended.
  status text not null default 'asked' check (status in ('asked', 'ready', 'passed', 'connected', 'released')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (request_id, helper_user_id)
);
create index if not exists nova_request_offers_helper on public.nova_request_offers (helper_user_id, created_at desc);

create table if not exists public.nova_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.nova_requests (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists nova_request_messages_request on public.nova_request_messages (request_id, created_at);

alter table public.nova_requests enable row level security;
alter table public.nova_request_offers enable row level security;
alter table public.nova_request_messages enable row level security;

commit;
