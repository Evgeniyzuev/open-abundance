-- Wallet chain "Abundance stays" (docs/WALLET_RETENTION_PLAN.md, section 6):
--   first top-up -> net top-ups of $20 -> 7 / 15 / 30 / 60 days without a crypto withdrawal.
-- Each step is a prerequisite of the next one; a streak counts from the completion of the previous step,
-- so a finished step never pays twice. Rewards are Core and live in these rows (editable without code).
-- Verification: app/api/challenges/check/route.ts with lib/stayStreak.ts.
insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a01',
  '{"en": "First Wallet top-up", "ru": "Первое пополнение Wallet"}'::jsonb,
  '{"en": "Top up your Wallet with any amount.", "ru": "Пополните Wallet на любую сумму."}'::jsonb,
  '{"en": "Open Wallet, choose Top up and send any amount. The challenge is checked from the server ledger.", "ru": "Откройте Кошелёк, выберите пополнение и отправьте любую сумму. Проверка идёт по серверному ledger."}'::jsonb,
  '{"en": "At least one credited Wallet top-up.", "ru": "Есть хотя бы одно зачисленное пополнение Wallet."}'::jsonb,
  'finance', 1, 1, 'auto', 'wallet_first_deposit',
  80, 'wallet_stay', 1, null, 'wallet.core', 1.0, 0, true
),
(
  'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a02',
  '{"en": "Net top-ups of $20", "ru": "Чистое пополнение на $20"}'::jsonb,
  '{"en": "Top-ups minus withdrawals reach $20.", "ru": "Пополнения за вычетом выводов достигают $20."}'::jsonb,
  '{"en": "Keep topping up your Wallet. The card shows your current net amount. Withdrawals reduce it.", "ru": "Пополняйте Wallet. В карточке видна ваша текущая сумма. Выводы её уменьшают."}'::jsonb,
  '{"en": "Net top-ups (top-ups minus withdrawals) of at least $20.", "ru": "Чистое пополнение (пополнения минус выводы) не меньше $20."}'::jsonb,
  'finance', 2, 3, 'auto', 'wallet_net_deposit_20',
  81, 'wallet_stay', 2, 'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a01', 'wallet.core', 1.2, 0, true
),
(
  'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a03',
  '{"en": "Abundance stays: a week", "ru": "Изобилие остаётся: неделя"}'::jsonb,
  '{"en": "Keep your abundance in the app for 7 days without withdrawals.", "ru": "Держите изобилие в приложении 7 дней без выводов."}'::jsonb,
  '{"en": "Use your Wallet inside the app, but do not withdraw. Purchases and moving money to Core never break the streak. It counts from the moment you completed the previous step.", "ru": "Пользуйтесь Wallet внутри приложения, но не выводите. Покупки и перевод в Core серию не прерывают. Отсчёт идёт с момента выполнения предыдущего шага."}'::jsonb,
  '{"en": "7 days in a row without a crypto withdrawal.", "ru": "7 дней подряд без вывода."}'::jsonb,
  'finance', 2, 7, 'auto', 'stay_streak_7',
  82, 'wallet_stay', 3, 'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a02', 'wallet.core', 1.5, 0, true
),
(
  'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a04',
  '{"en": "Abundance stays: 15 days", "ru": "Изобилие остаётся: 15 дней"}'::jsonb,
  '{"en": "Keep your abundance in the app for 15 days without withdrawals.", "ru": "Держите изобилие в приложении 15 дней без выводов."}'::jsonb,
  '{"en": "Same rule, counted from the previous step.", "ru": "То же правило, отсчёт с предыдущего шага."}'::jsonb,
  '{"en": "15 days in a row without a crypto withdrawal.", "ru": "15 дней подряд без вывода."}'::jsonb,
  'finance', 3, 15, 'auto', 'stay_streak_15',
  83, 'wallet_stay', 4, 'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a03', 'wallet.core', 1.8, 0, true
),
(
  'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a05',
  '{"en": "Abundance stays: 30 days", "ru": "Изобилие остаётся: 30 дней"}'::jsonb,
  '{"en": "Keep your abundance in the app for 30 days without withdrawals.", "ru": "Держите изобилие в приложении 30 дней без выводов."}'::jsonb,
  '{"en": "Same rule, counted from the previous step.", "ru": "То же правило, отсчёт с предыдущего шага."}'::jsonb,
  '{"en": "30 days in a row without a crypto withdrawal.", "ru": "30 дней подряд без вывода."}'::jsonb,
  'finance', 3, 30, 'auto', 'stay_streak_30',
  84, 'wallet_stay', 5, 'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a04', 'wallet.core', 2.0, 0, true
),
(
  'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a06',
  '{"en": "Abundance stays: 60 days", "ru": "Изобилие остаётся: 60 дней"}'::jsonb,
  '{"en": "Keep your abundance in the app for 60 days without withdrawals.", "ru": "Держите изобилие в приложении 60 дней без выводов."}'::jsonb,
  '{"en": "Same rule, counted from the previous step.", "ru": "То же правило, отсчёт с предыдущего шага."}'::jsonb,
  '{"en": "60 days in a row without a crypto withdrawal.", "ru": "60 дней подряд без вывода."}'::jsonb,
  'finance', 4, 60, 'auto', 'stay_streak_60',
  85, 'wallet_stay', 6, 'c1f4e7a0-5b2d-4c8e-9a31-7d6b8e2f1a05', 'wallet.core', 2.5, 0, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    core_reward_amount = excluded.core_reward_amount,
    sort_order = excluded.sort_order,
    prerequisite_challenge_id = excluded.prerequisite_challenge_id;
