-- Lightweight, private product feedback from any signed-in participant.
-- Written and read only by server APIs using the service role.
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('idea', 'problem', 'confusing', 'other')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  screen text check (screen is null or char_length(screen) <= 80),
  locale text check (locale is null or char_length(locale) <= 8),
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_user_created_idx on public.user_feedback (user_id, created_at desc);
create index if not exists user_feedback_created_idx on public.user_feedback (created_at desc);

alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from public, anon, authenticated;
grant select, insert on public.user_feedback to service_role;
