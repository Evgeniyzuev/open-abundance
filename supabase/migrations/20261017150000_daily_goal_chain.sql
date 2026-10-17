-- Daily goal chain. A day is credited by how much of the daily Core target was reached in Today:
-- any action beyond signing in keeps the streak, 50% counts the day, 100% is a full day (the bonus).
-- Rewards are Core and live in these rows (editable without code); the chain has no final step and can be extended.
--
--   3 days in a row at 50% or more   Core +1
--   7 days in a row at 50% or more   Core +2
--   7 full days (100%)               Core +2

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'c4a8f1d2-6b3e-4d97-8a15-2e9b7c3f5a41',
  '{"ru":"Полдня три дня подряд","en":"Half the goal, three days in a row"}'::jsonb,
  '{"ru":"Набирайте хотя бы половину дневной цели Core три дня подряд. Если сделали хоть что-то кроме входа, серия не рвётся.","en":"Reach at least half of the daily Core target three days in a row. Anything beyond signing in keeps the streak alive."}'::jsonb,
  '{"ru":"1. Откройте «Сегодня» и посмотрите цель дня.\n2. Пополните Core или завершите челлендж.\n3. Повторите три дня подряд и нажмите «Проверить выполнение».","en":"1. Open Today and see the day target.\n2. Top up Core or complete a challenge.\n3. Repeat for three days in a row and press Check completion."}'::jsonb,
  '{"ru":"Три дня подряд набрано не меньше 50 % дневной цели.","en":"At least 50% of the daily target on three days in a row."}'::jsonb,
  'focus', 2, 7, 'auto', 'daily_goal_half_streak_3',
  150, 'daily_goal', 1, null, 'home', 1, 0, true
),
(
  'c4a8f1d2-6b3e-4d97-8a15-2e9b7c3f5a42',
  '{"ru":"Неделя в ритме","en":"A week in rhythm"}'::jsonb,
  '{"ru":"Семь дней подряд хотя бы половина дневной цели Core.","en":"At least half of the daily Core target for seven days in a row."}'::jsonb,
  '{"ru":"Продолжайте серию: каждый день хотя бы половина цели в «Сегодня». Пропущенный день обнуляет серию, день без действий кроме входа тоже.","en":"Keep the streak: at least half of the target in Today every day. A missed day, or a day with nothing beyond signing in, resets it."}'::jsonb,
  '{"ru":"Семь дней подряд набрано не меньше 50 % дневной цели.","en":"At least 50% of the daily target on seven days in a row."}'::jsonb,
  'focus', 3, 14, 'auto', 'daily_goal_half_streak_7',
  151, 'daily_goal', 2, 'c4a8f1d2-6b3e-4d97-8a15-2e9b7c3f5a41', 'home', 2, 0, true
),
(
  'c4a8f1d2-6b3e-4d97-8a15-2e9b7c3f5a43',
  '{"ru":"Семь полных дней","en":"Seven full days"}'::jsonb,
  '{"ru":"Бонус за полную цель: семь дней, когда вы набрали все 100 % дневной цели Core (не обязательно подряд).","en":"A bonus for the full target: seven days when you reached 100% of the daily Core target (not necessarily in a row)."}'::jsonb,
  '{"ru":"Закрывайте цель дня целиком. Дни считаются, даже если между ними были перерывы.","en":"Close the day target completely. Days count even if there were breaks between them."}'::jsonb,
  '{"ru":"Семь дней с полностью выполненной дневной целью.","en":"Seven days with the daily target fully reached."}'::jsonb,
  'focus', 3, 30, 'auto', 'daily_goal_full_total_7',
  152, 'daily_goal', 3, 'c4a8f1d2-6b3e-4d97-8a15-2e9b7c3f5a41', 'home', 2, 0, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    core_reward_amount = excluded.core_reward_amount,
    sort_order = excluded.sort_order;
