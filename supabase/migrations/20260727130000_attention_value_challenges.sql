-- First-session educational challenges. The registration reward remains separate.
insert into public.challenges (
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
  track_key,
  track_step,
  prerequisite_challenge_id,
  action_view
)
select
  '{"en":"Calculate the Value of Your Attention","ru":"Посчитай цену своего внимания"}'::jsonb,
  '{"en":"Turn your daily screen time into a personal estimate and see what the same rhythm could mean over time.","ru":"Переведи ежедневное экранное время в личную оценку и посмотри, что тот же ритм может значить со временем."}'::jsonb,
  '{"en":"Choose your minutes and your own hourly estimate. The result is a personal scenario, not a claim about what platforms actually earn.","ru":"Выбери минуты и собственную оценку часа. Результат — личный сценарий, а не утверждение о фактическом доходе платформ."}'::jsonb,
  '{"en":"Complete the attention estimate and save the scenario.","ru":"Заверши оценку внимания и сохрани сценарий."}'::jsonb,
  '{"en":"Core +1$","ru":"Core +1$"}'::jsonb,
  'self_discovery',
  1,
  1,
  null,
  'auto',
  'attention_value_audit',
  5,
  null,
  null,
  null,
  null
where not exists (
  select 1 from public.challenges where verification_logic = 'attention_value_audit'
);

insert into public.challenges (
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
  track_key,
  track_step,
  prerequisite_challenge_id,
  action_view
)
select
  '{"en":"Core Law and the Power of Compound Growth","ru":"Закон Core и сила сложного процента"}'::jsonb,
  '{"en":"Learn the boundaries of Core and see how a small starting amount changes under a long-term compound-growth scenario.","ru":"Узнай границы Core и посмотри, как небольшая стартовая сумма меняется в долгом сценарии сложного роста."}'::jsonb,
  '{"en":"Read the Core rules, study the 30-year illustration and pass the short understanding test.","ru":"Прочитай правила Core, изучи 30-летнюю иллюстрацию и пройди короткую проверку понимания."}'::jsonb,
  '{"en":"Pass the Core law and compound-growth test.","ru":"Пройди проверку закона Core и сложного роста."}'::jsonb,
  '{"en":"Core +1$","ru":"Core +1$"}'::jsonb,
  'core_education',
  1,
  1,
  null,
  'auto',
  'core_law_understood',
  6,
  null,
  null,
  null,
  null
where not exists (
  select 1 from public.challenges where verification_logic = 'core_law_understood'
);

