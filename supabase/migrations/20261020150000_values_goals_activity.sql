-- "Values and goals": a repeatable activity in the feed and a one-time challenge for passing it.
--
-- The activity: a life balance wheel (where I am and where I want to be in eight spheres, with the criteria
-- behind each score) and goal cards swiped right ("I want", becomes a private wish) or left ("not mine").
-- One row per person keeps the latest wheel, a short wheel history, the latest decision per card and the
-- total number of swipes. Writes go through /api/values with the service role; the owner can read the row.
--
-- The challenge: save the wheel and make 30 swipes. Reward as for the other learning challenges: Core +1.

create table if not exists public.user_values_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wheel jsonb,
  wheel_saved_at timestamptz,
  wheel_history jsonb not null default '[]'::jsonb,
  swipes jsonb not null default '{}'::jsonb,
  swipe_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_values_profiles_swipe_count_non_negative check (swipe_count >= 0),
  constraint user_values_profiles_history_is_array check (jsonb_typeof(wheel_history) = 'array'),
  constraint user_values_profiles_swipes_is_object check (jsonb_typeof(swipes) = 'object')
);

alter table public.user_values_profiles enable row level security;

drop policy if exists "user_values_profiles_owner_select" on public.user_values_profiles;
create policy "user_values_profiles_owner_select"
  on public.user_values_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.user_values_profiles from public, anon, authenticated;
grant select on public.user_values_profiles to authenticated;
grant select, insert, update, delete on public.user_values_profiles to service_role;

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values (
  '3c9e5f1a-7b2d-4e68-a4c1-5d8f0b6e2a71',
  '{"ru":"Определи свои ценности и цели","en":"Find your values and goals"}'::jsonb,
  '{"ru":"Оцените, где вы сейчас и где хотите быть в восьми сферах жизни, и выберите цели свайпами: вправо «хочу», влево «не моё». Каждое «хочу» становится вашим желанием.","en":"Rate where you are and where you want to be in eight areas of life, then pick goals by swiping: right for I want, left for not mine. Every I want becomes your wish."}'::jsonb,
  '{"ru":"1. Откройте «Ценности и цели» здесь или в ленте.\n2. Колесо баланса: для каждой сферы поставьте «сейчас» и «хочу» от 0 до 10 и коротко напишите, по каким критериям ставили оценку.\n3. Карточки целей: свайп вправо «хочу», влево «не моё». Сначала идут сферы, где разрыв больше.\n4. Сделайте 30 свайпов и нажмите «Проверить выполнение».\nВозвращаться можно когда угодно: колесо можно обновить, карточки пересмотреть.","en":"1. Open Values and goals here or in the feed.\n2. Balance wheel: for each area set now and want from 0 to 10 and write briefly what criteria you used.\n3. Goal cards: swipe right for I want, left for not mine. Areas with the biggest gap come first.\n4. Make 30 swipes and press Check completion.\nCome back any time: update the wheel or review the cards again."}'::jsonb,
  '{"ru":"Колесо баланса сохранено (хотя бы одна сфера с критериями) и сделано 30 свайпов карточек целей.","en":"The balance wheel is saved (at least one area with criteria) and 30 goal cards are swiped."}'::jsonb,
  'self_discovery', 1, 3, 'auto', 'values_goals_defined',
  22, 'people.feed', 1, 0, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    duration_days = excluded.duration_days,
    verification_type = excluded.verification_type,
    verification_logic = excluded.verification_logic,
    sort_order = excluded.sort_order,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount,
    is_active = excluded.is_active;
