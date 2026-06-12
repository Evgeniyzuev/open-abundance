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
  sort_order
) values (
  '5a491e67-d002-4e75-8062-673ef2eaf75d',
  '{"en":"First Wallet To Core","ru":"Первый перевод в Core"}'::jsonb,
  '{"en":"Move any amount from Wallet into Core to turn available balance into long-term capital.","ru":"Переведите любую сумму из Wallet в Core, чтобы превратить доступный баланс в долгосрочный капитал."}'::jsonb,
  '{"en":"Open Wallet -> Core, tap Top up Core, enter an amount from Wallet and confirm.","ru":"Откройте Кошелек -> Core, нажмите Пополнить ядро, введите сумму из Wallet и подтвердите."}'::jsonb,
  '{"en":"At least one completed Wallet -> Core top-up exists in the server ledger.","ru":"Есть хотя бы одно завершенное пополнение Core из Wallet в серверном ledger."}'::jsonb,
  '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  'finance',
  2,
  1,
  null,
  'auto',
  'first_wallet_to_core',
  62
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
  is_active = true;
