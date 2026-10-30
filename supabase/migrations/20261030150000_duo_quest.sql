-- Founder decision 2026-10-30 (Duolingo «friend quest»): a task for two. A person invites a friend by link; for 7 days
-- each of them marks one small step a day with a line about it, and each sees the other's steps. When both have
-- marked 5 days within the week, each can claim the reward ($2 Core). Not on the growth path; one reward per person.
begin;

create table if not exists public.duo_quests (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  partner_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'succeeded', 'ended')),
  days int not null default 7 check (days between 3 and 30),
  needed_days int not null default 5 check (needed_days >= 1),
  started_on date,
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  check (partner_user_id is null or partner_user_id <> inviter_user_id)
);
create index if not exists duo_quests_inviter on public.duo_quests (inviter_user_id, created_at desc);
create index if not exists duo_quests_partner on public.duo_quests (partner_user_id, created_at desc);

create table if not exists public.duo_checkins (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.duo_quests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  note text not null check (char_length(note) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (duo_id, user_id, day)
);

alter table public.duo_quests enable row level security;
alter table public.duo_checkins enable row level security;
drop policy if exists "duo quests are readable by members" on public.duo_quests;
create policy "duo quests are readable by members" on public.duo_quests for select
  using (auth.uid() = inviter_user_id or auth.uid() = partner_user_id);
drop policy if exists "duo checkins are readable by members" on public.duo_checkins;
create policy "duo checkins are readable by members" on public.duo_checkins for select
  using (exists (select 1 from public.duo_quests q where q.id = duo_id and (auth.uid() = q.inviter_user_id or auth.uid() = q.partner_user_id)));

insert into public.challenges (
  id, title, description, instructions, requirements, category, difficulty_level, duration_days, image_url,
  verification_type, is_active, sort_order, verification_logic, track_key, track_step, action_view,
  is_permanent, core_reward_amount, wallet_reward_amount, activity_type, reward_mode, path_order, unlock_at_completed
) values (
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a09',
  '{"ru": "Задание на двоих", "en": "A task for two"}',
  '{"ru": "Позови друга, и неделю идите к своим целям вместе: каждый день по маленькому шагу, и вы видите шаги друг друга. Когда у обоих наберётся 5 дней из 7, каждый получает $2 в Core.", "en": "Invite a friend and move toward your goals together for a week: one small step a day, and you see each other''s steps. When you both have 5 days out of 7, each of you gets $2 in Core."}',
  '{"ru": "1. Нажми «Позвать друга» и отправь ссылку.\n2. Когда друг присоединится, каждый день отмечай свой шаг одной строкой.\n3. Когда у обоих будет 5 дней, нажми «Забрать награду».", "en": "1. Tap Invite a friend and send the link.\n2. Once your friend joins, mark your step each day in one line.\n3. When you both have 5 days, tap Claim reward."}',
  '{"ru": "5 дней с шагом из 7 у тебя и у друга. Награда $2 в Core каждому.", "en": "5 days with a step out of 7 for you and your friend. $2 in Core each."}',
  'social', 1, 7, null,
  'auto', true, 47, 'duo_week', null, null, null,
  false, 2.00, 0.00, 'mission', 'guaranteed', null, 0
) on conflict (id) do nothing;

commit;
