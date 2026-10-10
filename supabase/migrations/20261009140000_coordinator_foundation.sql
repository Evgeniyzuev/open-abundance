-- Coordinator foundation: consented "can help / need help" tags and an approval queue for
-- coordinator recommendations.
--
-- Deliberately small. Behaviour signals reuse product_events, ledger, challenge and wish tables;
-- only data that has no existing home is stored here. Both tables are written and read only by
-- server APIs with the service role.

-- 1. Help profile -----------------------------------------------------------------------------
-- Fixed tag keys (no free text) so tags cannot leak personal details and can be matched
-- deterministically. match_consent must be true before a tag is used for any matching.
create table if not exists public.user_help_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  offers text[] not null default '{}',
  needs text[] not null default '{}',
  match_consent boolean not null default false,
  consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_help_profiles_offers_size check (cardinality(offers) <= 12),
  constraint user_help_profiles_needs_size check (cardinality(needs) <= 12)
);

create index if not exists user_help_profiles_consent_idx
  on public.user_help_profiles (match_consent)
  where match_consent;

alter table public.user_help_profiles enable row level security;
revoke all on public.user_help_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.user_help_profiles to service_role;

-- 2. Recommendation queue ---------------------------------------------------------------------
-- The coordinator proposes; the operator decides. dedupe_key makes proposals idempotent so a
-- repeated digest run does not create duplicates. Decisions and outcomes feed later learning.
create table if not exists public.coordinator_recommendations (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  kind text not null check (kind in ('match', 'challenge', 'outreach', 'experiment', 'support', 'other')),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  rationale text not null default '' check (char_length(rationale) <= 2000),
  expected_effect text not null default '' check (char_length(expected_effect) <= 500),
  risk text not null default '' check (char_length(risk) <= 500),
  target_user_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'rules' check (source in ('rules', 'ai', 'operator')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'done', 'expired')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  outcome text check (outcome is null or char_length(outcome) <= 1000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint coordinator_recommendations_targets_size check (cardinality(target_user_ids) <= 50)
);

create unique index if not exists coordinator_recommendations_dedupe_idx
  on public.coordinator_recommendations (dedupe_key);

create index if not exists coordinator_recommendations_status_idx
  on public.coordinator_recommendations (status, created_at desc);

alter table public.coordinator_recommendations enable row level security;
revoke all on public.coordinator_recommendations from public, anon, authenticated;
grant select, insert, update on public.coordinator_recommendations to service_role;
