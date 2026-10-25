-- Quests and the growth path (docs/QUEST_PATH_PLAN.md, stage 1).
--
-- path_order puts a quest on the main path; the path quest after the last started one becomes the active quest by
-- itself. unlock_at_completed opens a side quest after that many completed quests, so new quests are a reward.
-- user_challenges.is_active marks the one active quest; user_profiles keeps the answer to "why are you here".

alter table public.challenges
  add column if not exists path_order integer,
  add column if not exists unlock_at_completed integer not null default 0;

alter table public.challenges drop constraint if exists challenges_unlock_at_completed_check;
alter table public.challenges
  add constraint challenges_unlock_at_completed_check check (unlock_at_completed >= 0);

create unique index if not exists challenges_path_order_idx
on public.challenges (path_order)
where path_order is not null and is_active;

alter table public.user_challenges
  add column if not exists is_active boolean not null default false;

create unique index if not exists user_challenges_one_active_idx
on public.user_challenges (user_id)
where is_active;

alter table public.user_profiles
  add column if not exists quest_motive text,
  add column if not exists quest_motive_note text;

alter table public.user_profiles drop constraint if exists user_profiles_quest_motive_check;
alter table public.user_profiles
  add constraint user_profiles_quest_motive_check check (
    (quest_motive is null or quest_motive in ('income', 'wish', 'change', 'learn', 'path', 'own'))
    and (quest_motive_note is null or char_length(quest_motive_note) <= 200)
  );

-- New path quests. Ids are new: 6f3a1c52-...-1a03 was reused by the humanity check and overwrote "install the app".
insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a01',
  '{"ru":"Первый шаг","en":"First step"}'::jsonb,
  '{"ru":"Представь, что AI уже сейчас учится исполнять желания людей. А значит, то, что есть у других, может быть и у тебя. И ты сейчас тут не случайно. Для чего ты здесь?","en":"Imagine that AI is already learning to fulfil people''s wishes. That means what others have can be yours too. And you are not here by chance. What are you here for?"}'::jsonb,
  '{"ru":"Выбери ответ или впиши свой. Нова учтёт его, когда будет предлагать квесты.","en":"Pick an answer or write your own. Nova will use it when she suggests quests."}'::jsonb,
  '{"ru":"Ответ выбран.","en":"An answer is chosen."}'::jsonb,
  'start_path', 1, null, 'auto', 'first_step_motive', 1, null, 1, 0, true
),
(
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a02',
  '{"ru":"Связь с Новой","en":"Stay in touch with Nova"}'::jsonb,
  '{"ru":"Чтобы Нова могла написать тебе о твоём желании и новых квестах, нужен канал связи: уведомления в приложении или Telegram-бот.","en":"So Nova can tell you about your wish and new quests, she needs a way to reach you: app notifications or the Telegram bot."}'::jsonb,
  '{"ru":"1. Выбери канал: уведомления или Telegram.\n2. Нажми «Прислать код».\n3. Введи код и нажми «Проверить выполнение».","en":"1. Pick a channel: notifications or Telegram.\n2. Press Send the code.\n3. Enter the code and press Check completion."}'::jsonb,
  '{"ru":"Введён код, пришедший через выбранный канал.","en":"The code that came through the chosen channel is entered."}'::jsonb,
  'start_path', 1, null, 'auto', 'channel_connected', 21, null, 1, 0, true
),
(
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03',
  '{"ru":"Установите приложение и подтвердите уведомлением","en":"Install the app and confirm with a notification"}'::jsonb,
  '{"ru":"Установите Open Abundance на телефон, включите уведомления и откройте приложение, когда оно напомнит о себе.","en":"Install Open Abundance on your phone, turn on notifications and open the app when it reminds you."}'::jsonb,
  '{"ru":"Установите приложение на главный экран и откройте его с иконки. В челлендже включите уведомления. Сегодня придёт одно уведомление, завтра до пяти в случайное время. Откройте приложение в течение 3 минут после любого из них.","en":"Add the app to your home screen and open it from the icon. Turn on notifications in the challenge. One notification arrives today and up to five tomorrow at random times. Open the app within 3 minutes of any of them."}'::jsonb,
  '{"ru":"Приложение открыто в течение 3 минут после уведомления.","en":"The app is opened within 3 minutes of a notification."}'::jsonb,
  'system', 1, 3, 'auto', 'install_ping_answered', 33, 'home', 2, 0, true
)
on conflict (id) do nothing;

-- The calculator quest: simpler, with the plan in the card itself.
update public.challenges
set title = '{"ru":"Рассчитай путь к желанию","en":"Work out the path to your wish"}'::jsonb,
    description = '{"ru":"Узнай, сколько добавлять в день, чтобы Core дорос до цены желания к выбранному сроку, и какой доход он будет давать.","en":"Find out how much to add a day so Core grows to the price of your wish by the date you pick, and what income it will give."}'::jsonb,
    instructions = '{"ru":"1. Впиши цену желания или возьми её из главного желания.\n2. Выбери срок.\n3. Посмотри дневную цель и сохрани план: он станет твоей целью дня.","en":"1. Enter the price of your wish or take it from your main wish.\n2. Pick a term.\n3. See the daily goal and save the plan: it becomes your goal for the day."}'::jsonb,
    requirements = '{"ru":"Сохранён план роста Core.","en":"A Core growth plan is saved."}'::jsonb
where id = '69ce2255-6676-4541-9a0f-5fe13b94c22c';

-- The path. Everything else is a side quest.
update public.challenges set path_order = null where path_order is not null;
update public.challenges as c
set path_order = p.path_order
from (values
  ('0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a01'::uuid, 1),
  ('87a8062d-21ce-4edb-a71f-320c68959da6'::uuid, 2),
  ('0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a02'::uuid, 3),
  ('69ce2255-6676-4541-9a0f-5fe13b94c22c'::uuid, 4),
  ('7c2a9f4e-3b1d-4e8a-9f6c-5d4e3b2a1f0e'::uuid, 5),
  ('1e14594c-69d7-4687-b17a-5773eca12e68'::uuid, 6),
  ('326889cd-98ba-4dd0-946c-78c632c1a26c'::uuid, 7),
  ('9d2c1f82-b07d-484a-b6c6-16310086f4b2'::uuid, 8),
  ('6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a03'::uuid, 9),
  ('26c433ec-a2fe-46e7-8a5d-2a7c3a571947'::uuid, 10),
  ('1b520e42-d5d2-4eb1-81bf-c16d12d4e246'::uuid, 11)
) as p(id, path_order)
where c.id = p.id;

-- Side quests open as completed quests add up: a few after the first one, most after four, the long series after five.
update public.challenges set unlock_at_completed = 0 where path_order is not null;
update public.challenges set unlock_at_completed = 4 where path_order is null;
update public.challenges set unlock_at_completed = 1
where path_order is null and verification_logic in ('values_goals_defined', 'ai_message_sent', 'niche_task_chosen', 'code_nova');
update public.challenges set unlock_at_completed = 3
where path_order is null and verification_logic in (
  'three_day_focus', 'skill_profile_completed', 'first_marketplace_listing', 'wallet_first_deposit',
  'first_wallet_to_core', 'team_contact_active', 'trust_event_confirmed:help_given', 'referral_program', 'peer_reviews',
  'app_testing_feedback', 'ai_essay_review'
);
update public.challenges set unlock_at_completed = 4 where id = '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03';
update public.challenges set unlock_at_completed = 5
where path_order is null and track_key in ('acquisition_publications', 'acquisition_quality_views', 'acquisition_quality_reactions', 'acquisition_quality_comments', 'creator', 'wallet_stay', 'growth', 'daily_goal');

-- "Code by push" and "Code in Telegram" now live inside "Stay in touch with Nova", so one channel is paid once.
update public.challenges set is_active = false where verification_logic in ('code_push', 'code_telegram');
