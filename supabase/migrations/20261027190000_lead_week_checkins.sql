-- The Open Abundance lead's weekly rhythm (docs/SMALL_WISHES_AND_LEADS_PLAN.md, stage 5, lib/leadPractices.ts):
-- one row per person and week with the goal, the mid-week answer and the result. The person chooses who sees it:
-- only themselves and Nova ('private') or also their live lead ('lead').

create table if not exists public.lead_week_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  practice_key text not null,
  goal text check (goal is null or char_length(goal) <= 200),
  wish_id uuid references public.wishes(id) on delete set null,
  midweek_status text check (midweek_status is null or midweek_status in ('going', 'stuck', 'need_help')),
  midweek_at timestamptz,
  review_status text check (review_status is null or review_status in ('done', 'partly', 'not_yet')),
  review_note text check (review_note is null or char_length(review_note) <= 400),
  reviewed_at timestamptz,
  visibility text not null default 'lead' check (visibility in ('private', 'lead')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start),
  check (extract(isodow from week_start) = 1)
);

create index if not exists lead_week_checkins_week_idx on public.lead_week_checkins (week_start);

alter table public.lead_week_checkins enable row level security;

drop policy if exists "Own week check-ins" on public.lead_week_checkins;
create policy "Own week check-ins"
on public.lead_week_checkins
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Lead reads followers' shared week check-ins" on public.lead_week_checkins;
create policy "Lead reads followers' shared week check-ins"
on public.lead_week_checkins
for select
using (
  visibility = 'lead'
  and exists (
    select 1
    from public.team_memberships membership
    where membership.member_user_id = lead_week_checkins.user_id
      and membership.leader_user_id = auth.uid()
      and membership.is_active
  )
);

grant select, insert, update on public.lead_week_checkins to authenticated;
