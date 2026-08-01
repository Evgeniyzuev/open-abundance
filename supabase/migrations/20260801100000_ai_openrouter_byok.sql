create table if not exists public.user_ai_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'openrouter'),
  encrypted_key text not null,
  encryption_iv text not null,
  key_version text not null default 'v1',
  key_fingerprint text not null,
  masked_key text not null,
  status text not null default 'active' check (status in ('active', 'invalid', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, provider)
);

create table if not exists public.ai_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  route_mode text not null default 'system' check (route_mode in ('system', 'byok')),
  model_id text not null default 'google/gemini-2.0-flash-001',
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  capability text not null default 'chat.general',
  provider text not null default 'openrouter',
  policy_version text not null,
  acknowledged_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, scope)
);

alter table public.user_ai_connections enable row level security;
alter table public.ai_user_settings enable row level security;
alter table public.ai_consents enable row level security;

revoke all on public.user_ai_connections from public, anon, authenticated;
revoke all on public.ai_user_settings from public, anon, authenticated;
revoke all on public.ai_consents from public, anon, authenticated;
grant select, insert, update, delete on public.user_ai_connections to service_role;
grant select, insert, update, delete on public.ai_user_settings to service_role;
grant select, insert, update, delete on public.ai_consents to service_role;
