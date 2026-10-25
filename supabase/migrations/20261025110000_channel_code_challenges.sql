-- Three "get a code" challenges: the code comes through the Telegram bot, a web push or a message from Nova, and the
-- person enters it on the challenge card. Each teaches one channel and proves it reaches the person. The code is
-- derived on the server (lib/channelCodesServer.ts), nothing is stored. Nova's message uses the new source 'system'.

alter table public.nova_inbox_messages drop constraint if exists nova_inbox_messages_source_check;
alter table public.nova_inbox_messages add constraint nova_inbox_messages_source_check
  check (source in ('operator', 'claude', 'system'));

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'f3a71c20-5d4e-4b8a-9c11-2e6d7b8a0c01',
  '{"ru":"Код в Telegram","en":"A code in Telegram"}'::jsonb,
  '{"ru":"Получите код от бота Open Abundance в Telegram. Так вы убедитесь, что уведомления приходят и туда.","en":"Get a code from the Open Abundance bot in Telegram. This makes sure notifications reach you there too."}'::jsonb,
  '{"ru":"1. Примите челлендж и нажмите «Прислать код».\n2. Если Telegram не привязан, привяжите его кнопкой в карточке. Если бот не может писать, откройте бота и нажмите Start.\n3. Введите код из сообщения бота и нажмите «Проверить выполнение».","en":"1. Accept the challenge and press Send the code.\n2. If Telegram is not linked, link it with the button on the card. If the bot cannot write to you, open the bot and press Start.\n3. Enter the code from the bot''s message and press Check completion."}'::jsonb,
  '{"ru":"Введён код, который прислал бот.","en":"The code sent by the bot is entered."}'::jsonb,
  'start_path', 1, 1, 'auto', 'code_telegram',
  7, null, 1, 0, true
),
(
  'f3a71c20-5d4e-4b8a-9c11-2e6d7b8a0c02',
  '{"ru":"Код в пуше","en":"A code in a push"}'::jsonb,
  '{"ru":"Получите код пуш-уведомлением на этом устройстве. Так вы убедитесь, что пуши включены и доходят.","en":"Get a code as a push notification on this device. This makes sure pushes are on and reach you."}'::jsonb,
  '{"ru":"1. Примите челлендж и нажмите «Прислать код».\n2. Если пуши не включены, включите их кнопкой в карточке и разрешите уведомления.\n3. Введите код из пуша и нажмите «Проверить выполнение».","en":"1. Accept the challenge and press Send the code.\n2. If pushes are off, turn them on with the button on the card and allow notifications.\n3. Enter the code from the push and press Check completion."}'::jsonb,
  '{"ru":"Введён код из пуша.","en":"The code from the push is entered."}'::jsonb,
  'start_path', 1, 1, 'auto', 'code_push',
  8, null, 1, 0, true
),
(
  'f3a71c20-5d4e-4b8a-9c11-2e6d7b8a0c03',
  '{"ru":"Код от Новы","en":"A code from Nova"}'::jsonb,
  '{"ru":"Получите код в чате с Новой. Так вы узнаете, где Нова пишет вам лично.","en":"Get a code in the chat with Nova. This shows where Nova writes to you personally."}'::jsonb,
  '{"ru":"1. Примите челлендж и нажмите «Прислать код».\n2. Откройте чат с Новой: код будет в её сообщении сверху.\n3. Вернитесь, введите код и нажмите «Проверить выполнение».","en":"1. Accept the challenge and press Send the code.\n2. Open the chat with Nova: the code is in her message at the top.\n3. Come back, enter the code and press Check completion."}'::jsonb,
  '{"ru":"Введён код из сообщения Новы.","en":"The code from Nova''s message is entered."}'::jsonb,
  'ai_assistant', 1, 1, 'auto', 'code_nova',
  9, null, 1, 0, true
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
