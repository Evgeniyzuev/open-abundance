-- The identity challenge is about humanity, not identity: rename it, and add a Wallet reward on top
-- of the Core reward (the check itself proves a unique person, so a Wallet reward is appropriate).
update public.challenges
set
  title = '{"ru":"Подтверждение человечности","en":"Humanity confirmation"}'::jsonb,
  description = '{"ru":"Подтвердите, что вы реальный человек: короткая проверка внешним провайдером открывает награды, которым нужен уникальный человек. За прохождение: +3 $ в Core и +1 $ в Wallet.","en":"Confirm you are a real person: a short check by an external provider unlocks rewards that need a unique person. Reward: +$3 in Core and +$1 in Wallet."}'::jsonb,
  wallet_reward_amount = 1
where verification_logic = 'humanity_confirmed';
