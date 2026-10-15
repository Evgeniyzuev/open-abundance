-- Challenge "Identity confirmation": completed once the humanity check (level 2) is passed.
-- The reward is Core only for now; it can move to Wallet after the flow is fully verified.
insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values (
  '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a03',
  '{"ru":"Подтверждение личности","en":"Identity confirmation"}'::jsonb,
  '{"ru":"Подтвердите, что вы реальный человек: короткая проверка внешним провайдером открывает награды, которым нужен уникальный человек.","en":"Confirm you are a real person: a short check by an external provider unlocks rewards that need a unique person."}'::jsonb,
  '{"ru":"1. Откройте проверку в карточке ниже.\n2. Поставьте галочку согласия и нажмите «Пройти проверку».\n3. Пройдите шаги провайдера: лицо в камеру, провайдер может запросить документ.\n4. Вернитесь в приложение и нажмите «Проверить выполнение».","en":"1. Open the check in the card below.\n2. Tick the consent box and press Start the check.\n3. Go through the provider steps: your face on camera, the provider may ask for a document.\n4. Come back to the app and press Check completion."}'::jsonb,
  '{"ru":"Проверка человечности успешно пройдена.","en":"The humanity check was passed."}'::jsonb,
  'trust', 1, 7, 'auto', 'humanity_confirmed',
  32, 'home.home', 3, 0, true
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
    wallet_reward_amount = excluded.wallet_reward_amount;
