-- Nova's weekly summary: one short text per person per completed week, written once and cached.
-- Server only (the API reads and writes it with the service role); people read it through the API.
create table if not exists public.nova_weekly_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  body text,
  empty boolean not null default false,
  source text not null default 'template' check (source in ('model', 'template')),
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.nova_weekly_summaries enable row level security;
revoke all on public.nova_weekly_summaries from public, anon, authenticated;
grant select, insert on public.nova_weekly_summaries to service_role;
