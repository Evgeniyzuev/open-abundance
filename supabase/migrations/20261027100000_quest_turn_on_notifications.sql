-- "Install the app" becomes "Turn on notifications" (Evgen, 2026-10-27): Core rewards are income for life, some rewards
-- go straight to Wallet, so notifications keep people from missing them. Steps in the quest: the Telegram bot's Start,
-- installing the web app on iPhone or Android, the notifications button. It counts once the account has an enabled push
-- subscription and the person taps "Check" (no code to type any more).
update public.challenges
set
  title = jsonb_build_object('ru', 'Включи уведомления', 'en', 'Turn on notifications'),
  description = jsonb_build_object(
    'ru', 'Награды в Core это пожизненный доход. А иногда награды приходят сразу в Wallet: чтобы не пропустить такие квесты, включи уведомления.',
    'en', 'Rewards in Core are income for life. Some rewards go straight to Wallet: turn on notifications so you don''t miss those quests.'
  ),
  instructions = jsonb_build_object(
    'ru', E'1. Если есть Telegram: открой бота и нажми «Старт».\n2. Установи приложение на iPhone или Android по инструкции в квесте.\n3. Нажми «Включить уведомления» прямо в квесте, затем «Проверить выполнение».',
    'en', E'1. If you use Telegram: open the bot and press Start.\n2. Install the app on iPhone or Android with the steps in the quest.\n3. Tap Turn on notifications right in the quest, then Check completion.'
  ),
  requirements = jsonb_build_object(
    'ru', 'Уведомления включены хотя бы на одном устройстве.',
    'en', 'Notifications are on on at least one device.'
  )
where verification_logic = 'app_installed';
