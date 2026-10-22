-- Track "growth" (GROW-001): actions that grow Core and the reserve, read from the facts (Wallet ledger top-ups,
-- completed internal purchases, spend intents). Core rewards only: Wallet rewards are paid for Core growth and
-- verified new people, with the bonus part set by the AI as a system parameter (founder decision 2026-10-22).

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'd4e7a1b2-9c35-4f68-b210-7a3c5e8f1d01',
  '{"ru": "Пополнения три месяца подряд", "en": "Top up Core in three different months"}'::jsonb,
  '{"ru": "Пополняйте Core в трёх разных месяцах: привычка важнее суммы.", "en": "Top up Core in three different months: the habit matters more than the amount."}'::jsonb,
  '{"ru": "Урок: регулярность растит Core надёжнее, чем одно большое пополнение, и помогает вам не откладывать желание. Выберите маленькую сумму, которую не жалко, и поставьте напоминание на один день в месяце.\n1. Пополните Core из Wallet в этом месяце.\n2. Повторите в следующем и в третьем.\n3. Нажмите «Проверить выполнение».", "en": "Lesson: regularity grows Core more reliably than one large top-up and keeps your wish from being postponed. Pick a small amount you are comfortable with and set a reminder for one day a month.\n1. Top up Core from Wallet this month.\n2. Repeat next month and the month after.\n3. Press Check completion."}'::jsonb,
  '{"ru": "Есть пополнения Core минимум в трёх разных календарных месяцах.", "en": "Core top-ups exist in at least three different calendar months."}'::jsonb,
  'finance', 3, 120, 'auto', 'growth_core_topup_3months',
  60, 'growth', 1, null, 'wallet.core', 1, 0, true
),
(
  'd4e7a1b2-9c35-4f68-b210-7a3c5e8f1d02',
  '{"ru": "Перенесите траты внутрь", "en": "Move your spending inside"}'::jsonb,
  '{"ru": "Отметьте регулярные траты и сделайте три покупки внутри Open Abundance за 60 дней.", "en": "Mark regular spending and make three purchases inside Open Abundance within 60 days."}'::jsonb,
  '{"ru": "Урок: каждая покупка внутри сообщества остаётся в нём и растёт вместе с вашим Core. Сначала отметьте, какие регулярные траты вы готовы перенести (суммы не нужны), затем купите нужное у участников или в Лавке.\n1. Откройте «Перенести траты» и выберите категории.\n2. Найдите предложения в Маркете или Лавке.\n3. Завершите три покупки и нажмите «Проверить выполнение».", "en": "Lesson: every purchase inside the community stays in it and grows with your Core. First mark which regular spending you are ready to move (no amounts needed), then buy what you need from members or in the Shop.\n1. Open Move your spending and choose categories.\n2. Find offers in Market or Shop.\n3. Complete three purchases and press Check completion."}'::jsonb,
  '{"ru": "Выбраны категории трат и завершены три покупки внутри за последние 60 дней.", "en": "Spending categories are chosen and three internal purchases were completed in the last 60 days."}'::jsonb,
  'marketplace', 3, 60, 'auto', 'growth_spend_shift',
  61, 'growth', 2, null, 'wallet.market', 1, 0, true
),
(
  'd4e7a1b2-9c35-4f68-b210-7a3c5e8f1d03',
  '{"ru": "Пополнение под желание", "en": "Top up Core for a wish"}'::jsonb,
  '{"ru": "Задайте желанию сумму и пополните Core: цель становится ближе.", "en": "Give a wish a target amount and top up Core: the goal gets closer."}'::jsonb,
  '{"ru": "Урок: желание с суммой превращается в план, а Core растёт и работает на него каждый день. Выберите желание, задайте цель и пополните Core на сумму, которую можете себе позволить.\n1. Откройте желание и укажите целевую сумму.\n2. Пополните Core из Wallet.\n3. Нажмите «Проверить выполнение».", "en": "Lesson: a wish with an amount becomes a plan, and Core grows and works for it every day. Pick a wish, set a target and top up Core by an amount you can afford.\n1. Open the wish and set a target amount.\n2. Top up Core from Wallet.\n3. Press Check completion."}'::jsonb,
  '{"ru": "Есть желание с целевой суммой и пополнение Core после его создания.", "en": "A wish with a target amount exists and Core was topped up after it was created."}'::jsonb,
  'finance', 2, 60, 'auto', 'growth_wish_topup',
  62, 'growth', 3, null, 'wallet.core', 1, 0, true
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
    track_key = excluded.track_key,
    track_step = excluded.track_step,
    prerequisite_challenge_id = excluded.prerequisite_challenge_id,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount,
    is_active = excluded.is_active;
