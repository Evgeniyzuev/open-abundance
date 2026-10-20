-- Challenges "Abundance Stays": a streak of days without crypto withdrawals (docs/WALLET_RETENTION_PLAN.md, section 6).
-- Verification is server-side in app/api/challenges/check/route.ts (lib/stayStreak.ts); the net-deposit gate is not shown to users.
insert into public.challenges (
  id, title, description, instructions, requirements, reward_label,
  category, difficulty_level, duration_days, image_url, verification_type, verification_logic, sort_order
) values
(
  '8d311282-6081-4320-8ea6-945a6d136f68',
  '{"en":"Abundance Stays: 7 days","ru":"Изобилие остаётся: неделю"}'::jsonb,
  '{"en":"Keep your abundance in the app for 7 days without withdrawals.","ru":"Держите изобилие в приложении неделю без выводов."}'::jsonb,
  '{"en":"Top up your Wallet, use it inside the app and do not withdraw. Spending in the app and moving money to Core never breaks the streak.","ru":"Пополните Wallet, пользуйтесь им внутри приложения и не выводите. Покупки в приложении и перевод в Core серию не прерывают."}'::jsonb,
  '{"en":"No crypto withdrawal for 7 days in the server ledger.","ru":"В серверном ledger нет вывода 7 дней подряд."}'::jsonb,
  '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  'finance', 2, 7, null, 'auto', 'stay_streak_7', 80
),
(
  '49cf42fe-8845-43ce-8ab4-3cccc29c9c74',
  '{"en":"Abundance Stays: 15 days","ru":"Изобилие остаётся: 15 дней"}'::jsonb,
  '{"en":"Keep your abundance in the app for 15 days without withdrawals.","ru":"Держите изобилие в приложении 15 дней без выводов."}'::jsonb,
  '{"en":"Top up your Wallet, use it inside the app and do not withdraw. Spending in the app and moving money to Core never breaks the streak.","ru":"Пополните Wallet, пользуйтесь им внутри приложения и не выводите. Покупки в приложении и перевод в Core серию не прерывают."}'::jsonb,
  '{"en":"No crypto withdrawal for 15 days in the server ledger.","ru":"В серверном ledger нет вывода 15 дней подряд."}'::jsonb,
  '{"en":"⚛️+2$","ru":"⚛️+2$"}'::jsonb,
  'finance', 2, 15, null, 'auto', 'stay_streak_15', 81
),
(
  'dda5a22c-5ff0-4d95-9edd-171e41f91abf',
  '{"en":"Abundance Stays: 30 days","ru":"Изобилие остаётся: 30 дней"}'::jsonb,
  '{"en":"Keep your abundance in the app for 30 days without withdrawals.","ru":"Держите изобилие в приложении 30 дней без выводов."}'::jsonb,
  '{"en":"Top up your Wallet, use it inside the app and do not withdraw. Spending in the app and moving money to Core never breaks the streak.","ru":"Пополните Wallet, пользуйтесь им внутри приложения и не выводите. Покупки в приложении и перевод в Core серию не прерывают."}'::jsonb,
  '{"en":"No crypto withdrawal for 30 days in the server ledger.","ru":"В серверном ledger нет вывода 30 дней подряд."}'::jsonb,
  '{"en":"⚛️+5$","ru":"⚛️+5$"}'::jsonb,
  'finance', 3, 30, null, 'auto', 'stay_streak_30', 82
),
(
  '649ab96a-5ffd-4f8a-a52e-21ec815f7c34',
  '{"en":"Abundance Stays: 60 days","ru":"Изобилие остаётся: 60 дней"}'::jsonb,
  '{"en":"Keep your abundance in the app for 60 days without withdrawals.","ru":"Держите изобилие в приложении 60 дней без выводов."}'::jsonb,
  '{"en":"Top up your Wallet, use it inside the app and do not withdraw. Spending in the app and moving money to Core never breaks the streak.","ru":"Пополните Wallet, пользуйтесь им внутри приложения и не выводите. Покупки в приложении и перевод в Core серию не прерывают."}'::jsonb,
  '{"en":"No crypto withdrawal for 60 days in the server ledger.","ru":"В серверном ledger нет вывода 60 дней подряд."}'::jsonb,
  '{"en":"⚛️+10$","ru":"⚛️+10$"}'::jsonb,
  'finance', 3, 60, null, 'auto', 'stay_streak_60', 83
),
(
  '867df75f-ab38-4353-8c9b-2b9b147387ce',
  '{"en":"Abundance Stays: 120 days","ru":"Изобилие остаётся: 120 дней"}'::jsonb,
  '{"en":"Keep your abundance in the app for 120 days without withdrawals.","ru":"Держите изобилие в приложении 120 дней без выводов."}'::jsonb,
  '{"en":"Top up your Wallet, use it inside the app and do not withdraw. Spending in the app and moving money to Core never breaks the streak.","ru":"Пополните Wallet, пользуйтесь им внутри приложения и не выводите. Покупки в приложении и перевод в Core серию не прерывают."}'::jsonb,
  '{"en":"No crypto withdrawal for 120 days in the server ledger.","ru":"В серверном ledger нет вывода 120 дней подряд."}'::jsonb,
  '{"en":"⚛️+20$","ru":"⚛️+20$"}'::jsonb,
  'finance', 4, 120, null, 'auto', 'stay_streak_120', 84
),
(
  '53f28aac-5cd2-47b7-a157-d0923dbe7877',
  '{"en":"Abundance Stays: 240 days","ru":"Изобилие остаётся: 240 дней"}'::jsonb,
  '{"en":"Keep your abundance in the app for 240 days without withdrawals.","ru":"Держите изобилие в приложении 240 дней без выводов."}'::jsonb,
  '{"en":"Top up your Wallet, use it inside the app and do not withdraw. Spending in the app and moving money to Core never breaks the streak.","ru":"Пополните Wallet, пользуйтесь им внутри приложения и не выводите. Покупки в приложении и перевод в Core серию не прерывают."}'::jsonb,
  '{"en":"No crypto withdrawal for 240 days in the server ledger.","ru":"В серверном ledger нет вывода 240 дней подряд."}'::jsonb,
  '{"en":"⚛️+40$","ru":"⚛️+40$"}'::jsonb,
  'finance', 4, 240, null, 'auto', 'stay_streak_240', 85
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  requirements = excluded.requirements,
  reward_label = excluded.reward_label,
  category = excluded.category,
  difficulty_level = excluded.difficulty_level,
  duration_days = excluded.duration_days,
  verification_type = excluded.verification_type,
  verification_logic = excluded.verification_logic,
  sort_order = excluded.sort_order,
  is_active = true;
