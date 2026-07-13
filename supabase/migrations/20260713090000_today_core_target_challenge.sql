update public.challenges
set
  title = '{"en":"Reach Today Core Target","ru":"Добери дневную цель Core"}'::jsonb,
  description = '{"en":"Complete enough useful actions today to reach your personal Core target in Today.","ru":"Сделай достаточно полезных действий сегодня, чтобы добрать личную Core-цель в Today."}'::jsonb,
  instructions = '{"en":"Open Today, complete challenge rewards or Wallet -> Core top-ups until the Today Core target is reached, then check this challenge.","ru":"Открой Today, получи Core-награды за челленджи или сделай Wallet -> Core пополнение до дневной цели, затем проверь этот челлендж."}'::jsonb,
  requirements = '{"en":"Today is completed: progress_core is greater than or equal to target_core for the current local day.","ru":"Today завершен: progress_core больше или равен target_core за текущий локальный день."}'::jsonb,
  verification_logic = 'today_core_target_reached',
  action_view = 'challenges.today'
where verification_logic = 'reinvest_enabled'
  and track_key = 'first_core_path';
