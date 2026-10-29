-- Founder decision 2026-10-29: «Включи уведомления» is also done when the Telegram bot can write to the person
-- (Start pressed), not only with web push (app/api/challenges/check/route.ts). Texts only; the reward is unchanged.
update public.challenges set
  requirements = '{"ru": "Бот в Telegram может тебе писать (нажат «Старт») или уведомления включены хотя бы на одном устройстве.", "en": "The Telegram bot can write to you (Start pressed) or notifications are on on at least one device."}',
  instructions = '{"ru": "1. Если есть Telegram: открой бота и нажми «Старт». Этого уже хватит, нажми «Проверить выполнение».\n2. Нет Telegram: установи приложение на iPhone или Android по инструкции в квесте.\n3. Нажми «Включить уведомления» прямо в квесте, затем «Проверить выполнение».", "en": "1. If you use Telegram: open the bot and press Start. That is already enough, tap Check.\n2. No Telegram: install the app on iPhone or Android with the guide in the quest.\n3. Tap Turn on notifications right in the quest, then Check."}'
where verification_logic = 'app_installed';
