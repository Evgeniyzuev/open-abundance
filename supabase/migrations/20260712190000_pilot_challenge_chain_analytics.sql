alter table public.challenges
add column if not exists track_key text,
add column if not exists track_step integer,
add column if not exists prerequisite_challenge_id uuid references public.challenges(id) on delete set null,
add column if not exists action_view text;

create index if not exists challenges_track_step_idx
on public.challenges (track_key, track_step)
where track_key is not null;

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  source text not null default 'app',
  entity_type text,
  entity_id uuid,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_id is not null)
);

create index if not exists product_events_name_time_idx
on public.product_events (event_name, occurred_at desc);

create index if not exists product_events_user_time_idx
on public.product_events (user_id, occurred_at desc)
where user_id is not null;

create index if not exists product_events_anonymous_time_idx
on public.product_events (anonymous_id, occurred_at desc)
where anonymous_id is not null;

alter table public.product_events enable row level security;

revoke all on table public.product_events from public, anon, authenticated;
grant select, insert on table public.product_events to service_role;

update public.challenges
set
  title = '{"en":"Save Your Progress","ru":"Сохрани свой путь"}'::jsonb,
  description = '{"en":"Create your Abundance profile and keep every next result connected to you.","ru":"Создай профиль Abundance, чтобы следующие результаты сохранялись в твоем пути."}'::jsonb,
  instructions = '{"en":"Sign in with Google. After returning, open Challenges and check this step.","ru":"Войди через Google. После возвращения открой Челленджи и проверь этот шаг."}'::jsonb,
  requirements = '{"en":"A profile, Core and Wallet exist for this account.","ru":"Для аккаунта созданы профиль, Core и Wallet."}'::jsonb,
  reward_label = '{"en":"Core +2$","ru":"Core +2$"}'::jsonb,
  category = 'start_path',
  difficulty_level = 0,
  duration_days = 1,
  image_url = null,
  track_key = 'first_core_path',
  track_step = 1,
  prerequisite_challenge_id = null,
  action_view = 'auth',
  sort_order = 10
where verification_logic = 'signup';

update public.challenges
set
  title = '{"en":"Choose Your Main Wish","ru":"Выбери главное желание"}'::jsonb,
  description = '{"en":"Name the result that makes daily growth personally meaningful to you.","ru":"Выбери результат, ради которого ежедневный рост имеет смысл именно для тебя."}'::jsonb,
  instructions = '{"en":"Open Goals, create one main wish and add a target amount when it can be estimated.","ru":"Открой Цели, создай одно главное желание и добавь целевую сумму, если ее можно оценить."}'::jsonb,
  requirements = '{"en":"At least one active personal wish exists.","ru":"Есть хотя бы одно активное личное желание."}'::jsonb,
  reward_label = '{"en":"Core +2$","ru":"Core +2$"}'::jsonb,
  category = 'start_path',
  difficulty_level = 1,
  duration_days = 1,
  image_url = null,
  track_key = 'first_core_path',
  track_step = 2,
  prerequisite_challenge_id = (select id from public.challenges where verification_logic = 'signup' limit 1),
  action_view = 'goals.desires',
  sort_order = 20
where verification_logic = 'has_wish';

update public.challenges
set
  title = '{"en":"Build Your Growth Plan","ru":"Построй план роста"}'::jsonb,
  description = '{"en":"See how Core, daily actions and reinvestment can change the time to your goal.","ru":"Посмотри, как Core, ежедневные действия и реинвестирование меняют срок до цели."}'::jsonb,
  instructions = '{"en":"Open Wallet > Core, calculate time to your target, save the plan and pass the short compound-growth check.","ru":"Открой Wallet > Core, рассчитай срок до цели, сохрани план и пройди короткую проверку понимания сложного роста."}'::jsonb,
  requirements = '{"en":"A saved calculation and a passed compound-growth check.","ru":"Сохраненный расчет и пройденная проверка понимания сложного роста."}'::jsonb,
  reward_label = '{"en":"Core +1$","ru":"Core +1$"}'::jsonb,
  category = 'start_path',
  difficulty_level = 1,
  duration_days = 1,
  image_url = null,
  track_key = 'first_core_path',
  track_step = 3,
  prerequisite_challenge_id = (select id from public.challenges where verification_logic = 'has_wish' limit 1),
  action_view = 'wallet.core',
  sort_order = 30
where verification_logic = 'calculate_time_to_goal';

update public.challenges
set
  title = '{"en":"Turn On Core Growth","ru":"Включи рост Core"}'::jsonb,
  description = '{"en":"Choose how much of the daily accrual returns to Core and compounds.","ru":"Выбери, какая часть ежедневного начисления возвращается в Core и усиливает рост."}'::jsonb,
  instructions = '{"en":"Open Wallet > Core and set reinvestment above 0%. You can change it later.","ru":"Открой Wallet > Core и установи реинвестирование выше 0%. Позже его можно изменить."}'::jsonb,
  requirements = '{"en":"Core reinvestment is above 0%.","ru":"Реинвестирование Core выше 0%."}'::jsonb,
  reward_label = '{"en":"Core +1$","ru":"Core +1$"}'::jsonb,
  category = 'start_path',
  difficulty_level = 1,
  duration_days = 1,
  image_url = null,
  track_key = 'first_core_path',
  track_step = 4,
  prerequisite_challenge_id = (select id from public.challenges where verification_logic = 'calculate_time_to_goal' limit 1),
  action_view = 'wallet.core',
  sort_order = 40
where verification_logic = 'reinvest_enabled';

update public.challenges
set
  title = '{"en":"Publish Your First Result","ru":"Опубликуй первый результат"}'::jsonb,
  description = '{"en":"Turn your first completed steps into a visible result that another person can follow.","ru":"Преврати первые завершенные шаги в видимый результат, путь которого сможет повторить другой человек."}'::jsonb,
  instructions = '{"en":"Publish a public wish, progress post or daily result. Do not include private financial details.","ru":"Опубликуй публичное желание, пост о прогрессе или дневной результат. Не добавляй приватные финансовые данные."}'::jsonb,
  requirements = '{"en":"At least one published public feed post exists.","ru":"Есть хотя бы один опубликованный пост в публичной ленте."}'::jsonb,
  reward_label = '{"en":"Core +1$","ru":"Core +1$"}'::jsonb,
  category = 'start_path',
  difficulty_level = 1,
  duration_days = 1,
  image_url = null,
  track_key = 'first_core_path',
  track_step = 5,
  prerequisite_challenge_id = (select id from public.challenges where verification_logic = 'reinvest_enabled' limit 1),
  action_view = 'people.blog',
  sort_order = 50
where verification_logic = 'first_growth_post_published';

update public.challenges
set sort_order = case verification_logic
  when 'profile_strengths_filled' then 60
  when 'wish_steps_created' then 65
  when 'ai_message_sent' then 70
  when 'skill_profile_completed' then 75
  when 'first_wallet_to_core' then 80
  when 'first_wallet_transfer' then 85
  when 'team_contact_active' then 90
  when 'trust_event_confirmed:help_given' then 95
  when 'app_testing_review' then 100
  when 'trust_event_confirmed:proof_added' then 105
  when 'has_referral' then 110
  else sort_order
end
where verification_logic is not null
  and track_key is null;

update public.challenges
set
  verification_logic = 'three_day_focus',
  verification_type = 'manual',
  duration_days = 3,
  reward_label = '{"en":"Core +3$","ru":"Core +3$"}'::jsonb,
  image_url = null,
  sort_order = 68
where title->>'en' = 'Three Days Of Focus';
