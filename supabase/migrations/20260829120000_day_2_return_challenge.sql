-- Day 2 Return challenge: lightest retention challenge.
-- Verification: an app_open product event (or a completed Today instance)
-- on the calendar day after the challenge was accepted.

insert into public.challenges (
  id,
  title,
  description,
  instructions,
  requirements,
  reward_label,
  category,
  difficulty_level,
  duration_days,
  image_url,
  verification_type,
  verification_logic,
  sort_order,
  action_view
) values
(
  '7c2a9f4e-3b1d-4e8a-9f6c-5d4e3b2a1f0e',
  '{"en":"Day 2 Return","ru":"Вернись завтра"}'::jsonb,
  '{"en":"Come back to the app the next day. The first return is the first sign that the experience works for you.","ru":"Вернитесь в приложение на следующий день. Первый возврат — первый сигнал, что опыт зацепил."}'::jsonb,
  '{"en":"Open the app tomorrow and check Today or complete one action. A same-day revisit does not count.","ru":"Зайдите в приложение завтра, откройте Today или выполните одно действие. Повторный вход в тот же день не засчитывается."}'::jsonb,
  '{"en":"An app open or a completed Today on the calendar day after accepting this challenge.","ru":"Открытие приложения или завершённый Today на следующий календарный день после принятия челленджа."}'::jsonb,
  '{"en":"Core +1$","ru":"Core +1$"}'::jsonb,
  'focus',
  1,
  1,
  null,
  'auto',
  'day_2_return',
  71,
  'home'
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
  image_url = excluded.image_url,
  verification_type = excluded.verification_type,
  verification_logic = excluded.verification_logic,
  sort_order = excluded.sort_order,
  action_view = excluded.action_view,
  is_active = true;