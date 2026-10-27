-- Meetings with the lead (lib/leadMeetings.ts, docs/SMALL_WISHES_AND_LEADS_PLAN.md): the rhythm the person chose and one
-- row per meeting (how the last goal went, a question or wish, the goal for the next meeting). Only the person reads
-- and writes their own rows; Nova's invitations are sent by the coordinator job with the service role.

create table if not exists public.lead_meeting_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rhythm text not null check (rhythm in ('daily', 'three', 'weekly', 'off')),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_day date not null,
  last_goal_status text check (last_goal_status is null or last_goal_status in ('done', 'partly', 'not_yet')),
  question text check (question is null or char_length(question) <= 300),
  next_goal text check (next_goal is null or char_length(next_goal) <= 300),
  quests_since integer not null default 0 check (quests_since >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, meeting_day)
);

create index if not exists lead_meetings_user_created_idx on public.lead_meetings (user_id, created_at desc);

alter table public.lead_meeting_settings enable row level security;
alter table public.lead_meetings enable row level security;

drop policy if exists "Own meeting settings" on public.lead_meeting_settings;
create policy "Own meeting settings"
on public.lead_meeting_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Own meetings" on public.lead_meetings;
create policy "Own meetings"
on public.lead_meetings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.lead_meeting_settings to authenticated;
grant select, insert, update on public.lead_meetings to authenticated;
