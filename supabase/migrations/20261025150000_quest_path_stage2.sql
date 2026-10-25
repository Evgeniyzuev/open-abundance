-- Quests, stage 2 (docs/QUEST_PATH_PLAN.md).
--
-- "First step" takes several answers: user_profiles.quest_motives keeps all of them, quest_motive stays the first one.
-- The connection quest is split in two path quests, so everyone installs the app, Telegram or not:
--   step 3 "Install the app": a push code that only the installed app asks for;
--   step 4 "Connect the Telegram bot": the existing "A code in Telegram" quest, back on.

alter table public.user_profiles
  add column if not exists quest_motives text[] not null default '{}';

alter table public.user_profiles drop constraint if exists user_profiles_quest_motives_check;
alter table public.user_profiles
  add constraint user_profiles_quest_motives_check check (
    quest_motives <@ array['income', 'wish', 'change', 'learn', 'path', 'own']::text[]
    and cardinality(quest_motives) <= 6
  );

update public.user_profiles
set quest_motives = array[quest_motive]
where quest_motive is not null and cardinality(quest_motives) = 0;

update public.challenges
set title = '{"ru":"Установи приложение","en":"Install the app"}'::jsonb,
    description = '{"ru":"Установи Open Abundance на главный экран: так Нова сможет присылать уведомления о твоём желании и новых квестах, а приложение будет открываться в одно касание. Даже если ты уже в Telegram.","en":"Put Open Abundance on your home screen: Nova can then send notifications about your wish and new quests, and the app opens in one tap. Even if you already use Telegram."}'::jsonb,
    instructions = '{"ru":"1. Установи приложение по инструкции ниже.\n2. Открой его с иконки на главном экране.\n3. Нажми «Прислать код» и разреши уведомления.\n4. Введи код из уведомления и нажми «Проверить выполнение».","en":"1. Install the app with the steps below.\n2. Open it from the icon on your home screen.\n3. Press Send the code and allow notifications.\n4. Enter the code from the notification and press Check completion."}'::jsonb,
    requirements = '{"ru":"Введён код из уведомления, полученного в установленном приложении.","en":"The code from a notification received in the installed app is entered."}'::jsonb,
    verification_logic = 'app_installed'
where id = '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a02';

update public.challenges
set title = '{"ru":"Подключи Telegram-бота","en":"Connect the Telegram bot"}'::jsonb,
    description = '{"ru":"Второй канал Новы: бот напишет, когда квест ждёт или открылся новый. Если приложение не на телефоне, напоминание всё равно дойдёт.","en":"Nova''s second channel: the bot writes when a quest is waiting or a new one opens. The reminder reaches you even when the app is not at hand."}'::jsonb,
    instructions = '{"ru":"1. Привяжи Telegram и нажми Start в чате с ботом.\n2. Нажми «Прислать код».\n3. Введи код из чата и нажми «Проверить выполнение».","en":"1. Link Telegram and press Start in the chat with the bot.\n2. Press Send the code.\n3. Enter the code from the chat and press Check completion."}'::jsonb,
    category = 'start_path',
    sort_order = 22,
    unlock_at_completed = 0,
    is_active = true
where id = 'f3a71c20-5d4e-4b8a-9c11-2e6d7b8a0c01';

-- Shift steps 4..11 one down to make room. Through a high range, since the path index is checked row by row.
update public.challenges set path_order = path_order + 100 where path_order >= 4;
update public.challenges set path_order = path_order - 99 where path_order >= 100;
update public.challenges set path_order = 4 where id = 'f3a71c20-5d4e-4b8a-9c11-2e6d7b8a0c01';
