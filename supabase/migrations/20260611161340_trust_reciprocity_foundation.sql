create table if not exists public.trust_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'help_given',
      'help_received',
      'deal_completed',
      'challenge_confirmed',
      'proof_added'
    )
  ),
  source_type text not null check (
    source_type in (
      'challenge',
      'wish',
      'feed_post',
      'marketplace_deal',
      'team_contact',
      'manual'
    )
  ),
  source_id uuid,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'revoked')),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (target_user_id is null or actor_user_id <> target_user_id),
  check (confirmed_by_user_id is null or confirmed_by_user_id <> actor_user_id)
);

create table if not exists public.mutual_confirmations (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  counterparty_user_id uuid not null references auth.users(id) on delete cascade,
  confirmation_type text not null check (
    confirmation_type in (
      'help_given',
      'help_received',
      'deal_completed',
      'challenge_confirmed',
      'proof_added',
      'contact_confirmed'
    )
  ),
  source_type text not null check (
    source_type in (
      'challenge',
      'wish',
      'feed_post',
      'marketplace_deal',
      'team_contact',
      'manual'
    )
  ),
  source_id uuid,
  message text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'expired')),
  trust_event_id uuid references public.trust_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  metadata jsonb not null default '{}'::jsonb,
  check (requester_user_id <> counterparty_user_id)
);

create table if not exists public.reciprocity_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  help_given_count integer not null default 0 check (help_given_count >= 0),
  help_received_count integer not null default 0 check (help_received_count >= 0),
  deals_completed_count integer not null default 0 check (deals_completed_count >= 0),
  confirmations_given_count integer not null default 0 check (confirmations_given_count >= 0),
  confirmations_received_count integer not null default 0 check (confirmations_received_count >= 0),
  recent_positive_events integer not null default 0 check (recent_positive_events >= 0),
  unresolved_pending_count integer not null default 0 check (unresolved_pending_count >= 0),
  reciprocity_score integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists trust_events_actor_status_idx
on public.trust_events (actor_user_id, status, created_at desc);

create index if not exists trust_events_target_status_idx
on public.trust_events (target_user_id, status, created_at desc)
where target_user_id is not null;

create index if not exists trust_events_source_idx
on public.trust_events (source_type, source_id)
where source_id is not null;

create unique index if not exists trust_events_confirmed_source_unique_idx
on public.trust_events (event_type, source_type, source_id, actor_user_id, coalesce(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
where status = 'confirmed' and source_id is not null;

create index if not exists mutual_confirmations_requester_status_idx
on public.mutual_confirmations (requester_user_id, status, created_at desc);

create index if not exists mutual_confirmations_counterparty_status_idx
on public.mutual_confirmations (counterparty_user_id, status, created_at desc);

create unique index if not exists mutual_confirmations_pending_source_unique_idx
on public.mutual_confirmations (requester_user_id, counterparty_user_id, confirmation_type, source_type, source_id)
where status = 'pending' and source_id is not null;

create index if not exists reciprocity_balances_score_idx
on public.reciprocity_balances (reciprocity_score desc, updated_at desc);

alter table public.trust_events enable row level security;
alter table public.mutual_confirmations enable row level security;
alter table public.reciprocity_balances enable row level security;

grant select on table public.trust_events to authenticated;
grant select, insert on table public.mutual_confirmations to authenticated;
grant select on table public.reciprocity_balances to authenticated;

grant select, insert, update, delete on table public.trust_events to service_role;
grant select, insert, update, delete on table public.mutual_confirmations to service_role;
grant select, insert, update, delete on table public.reciprocity_balances to service_role;

drop policy if exists "Users can read related trust events" on public.trust_events;
create policy "Users can read related trust events"
on public.trust_events
for select
to authenticated
using (
  (select auth.uid()) = actor_user_id
  or (select auth.uid()) = target_user_id
  or (select auth.uid()) = created_by_user_id
  or (select auth.uid()) = confirmed_by_user_id
);

drop policy if exists "Users can read related confirmations" on public.mutual_confirmations;
create policy "Users can read related confirmations"
on public.mutual_confirmations
for select
to authenticated
using (
  (select auth.uid()) = requester_user_id
  or (select auth.uid()) = counterparty_user_id
);

drop policy if exists "Users can request confirmations" on public.mutual_confirmations;
create policy "Users can request confirmations"
on public.mutual_confirmations
for insert
to authenticated
with check (
  (select auth.uid()) = requester_user_id
  and requester_user_id <> counterparty_user_id
  and status = 'pending'
);

drop policy if exists "Users can read own reciprocity balance" on public.reciprocity_balances;
create policy "Users can read own reciprocity balance"
on public.reciprocity_balances
for select
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists touch_trust_events_updated_at on public.trust_events;
create trigger touch_trust_events_updated_at
before update on public.trust_events
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_mutual_confirmations_updated_at on public.mutual_confirmations;
create trigger touch_mutual_confirmations_updated_at
before update on public.mutual_confirmations
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_reciprocity_balances_updated_at on public.reciprocity_balances;
create trigger touch_reciprocity_balances_updated_at
before update on public.reciprocity_balances
for each row
execute function public.touch_updated_at();
