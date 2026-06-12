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
  'cb1040a4-d6af-4c41-ba6b-1b3112e296c1',
  '{"en":"Send Your First Transfer","ru":"Первый перевод участнику"}'::jsonb,
  '{"en":"Send any Wallet amount to another participant to learn the internal transfer flow.","ru":"Отправьте любую сумму из Wallet другому участнику, чтобы освоить внутренний перевод."}'::jsonb,
  '{"en":"Open Wallet transfer, choose another participant, enter an amount and confirm. The transfer must be non-self.","ru":"Откройте перевод Wallet, выберите другого участника, введите сумму и подтвердите. Перевод должен быть не самому себе."}'::jsonb,
  '{"en":"At least one completed outgoing Wallet transfer to another participant exists in the server ledger.","ru":"В серверном ledger есть хотя бы один завершенный исходящий Wallet-перевод другому участнику."}'::jsonb,
  '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  'social',
  2,
  1,
  null,
  'auto',
  'first_wallet_transfer',
  64
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
