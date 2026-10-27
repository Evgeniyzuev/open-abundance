-- «Вывод и пополнение» (founder decision 2026-10-27): step 7 of the quest path, after the daily Core target.
-- Done by any Wallet top-up or any withdrawal (lib/stayStreak.ts, wallet_deposit_or_withdrawal). «Я не робот» and the
-- first result move to steps 8 and 9 (path_order is unique: shift through +100 first).
begin;

update public.challenges set path_order = path_order + 100 where path_order >= 7;

insert into public.challenges (
  id, title, description, instructions, requirements, category, difficulty_level, duration_days, image_url,
  verification_type, is_active, sort_order, verification_logic, track_key, track_step, action_view,
  is_permanent, core_reward_amount, wallet_reward_amount, activity_type, reward_mode, path_order, unlock_at_completed
) values (
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a07',
  '{"ru": "Вывод и пополнение", "en": "Withdraw or top up"}',
  '{"ru": "Пополни Wallet или выведи из него любую сумму. Так ты сам увидишь, что деньги здесь настоящие и двигаются в обе стороны.", "en": "Top up your Wallet or withdraw any amount from it. You will see for yourself that the money here is real and moves both ways."}',
  '{"ru": "Открой Wallet. Пополни его на любую сумму или выведи любую сумму на свой кошелёк, затем нажми «Проверить». Первый вывод без «Я не робот» — от $1.", "en": "Open Wallet. Top it up with any amount or withdraw any amount to your own wallet, then tap Check. Without «I''m not a robot» the first withdrawal starts at $1."}',
  '{"ru": "Есть хотя бы одно зачисленное пополнение Wallet или один вывод.", "en": "At least one credited Wallet top-up or one withdrawal."}',
  'finance', 1, 1, null,
  'auto', true, 45, 'wallet_deposit_or_withdrawal', null, null, 'wallet.wallet',
  false, 1.00, 0.00, 'mission', 'guaranteed', 7, 0
);

update public.challenges set path_order = 8 where path_order = 107;
update public.challenges set path_order = 9 where path_order = 108;

commit;
