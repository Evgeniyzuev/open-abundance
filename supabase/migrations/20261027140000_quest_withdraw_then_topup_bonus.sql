-- Founder decisions 2026-10-27: «Вывод и пополнение» becomes two path steps after «Я не робот»:
--   7 «Я не робот» (pays $1 to Wallet, so the withdrawal needs no own money and has no $1 minimum)
--   8 «Первый вывод»: any withdrawal (without «Я не робот» the first withdrawal starts at $1, lib/withdrawalGate.ts)
--   9 «Пополнение +10%»: any top-up after step 8; 10% of it goes to Core at once, at most $5 (claimed with «Проверить»)
--  10 «Опубликуй первый результат»
begin;

-- Step 8 reuses the row created as «Вывод и пополнение» (20261027120000); nobody has progress on it yet.
update public.challenges set
  title = '{"ru": "Первый вывод", "en": "First withdrawal"}',
  description = '{"ru": "Выведи из Wallet любую сумму на свой кошелёк. Так ты сам увидишь, что деньги здесь настоящие.", "en": "Withdraw any amount from your Wallet to your own wallet. You will see for yourself that the money here is real."}',
  instructions = '{"ru": "Открой Wallet → Вывести, выбери TON или USDT и выведи любую сумму на свой кошелёк, затем нажми «Проверить». Без «Я не робот» первый вывод — от $1.", "en": "Open Wallet → Withdraw, choose TON or USDT and withdraw any amount to your own wallet, then tap Check. Without «I''m not a robot» the first withdrawal starts at $1."}',
  requirements = '{"ru": "Есть хотя бы один вывод из Wallet.", "en": "At least one withdrawal from Wallet."}',
  verification_logic = 'wallet_first_withdrawal'
where id = '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a07';

insert into public.challenges (
  id, title, description, instructions, requirements, category, difficulty_level, duration_days, image_url,
  verification_type, is_active, sort_order, verification_logic, track_key, track_step, action_view,
  is_permanent, core_reward_amount, wallet_reward_amount, activity_type, reward_mode, path_order, unlock_at_completed
) values (
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a08',
  '{"ru": "Пополнение +10%", "en": "Top-up +10%"}',
  '{"ru": "Пополни Wallet на любую сумму. 10% от пополнения сразу придут в Core, до $5.", "en": "Top up your Wallet with any amount. 10% of the top-up goes straight to Core, up to $5."}',
  '{"ru": "Открой Wallet → Пополнить и пополни на любую сумму, затем нажми «Проверить». Считается пополнение после первого вывода.", "en": "Open Wallet → Top up and add any amount, then tap Check. A top-up made after your first withdrawal counts."}',
  '{"ru": "Есть пополнение Wallet после первого вывода. Бонус: 10% от пополнений после вывода, не больше $5.", "en": "A Wallet top-up after the first withdrawal. Bonus: 10% of the top-ups after the withdrawal, at most $5."}',
  'finance', 1, 1, null,
  'auto', true, 46, 'wallet_topup_bonus', null, null, 'wallet.wallet',
  false, 0.00, 0.00, 'mission', 'guaranteed', null, 0
);

update public.challenges set path_order = path_order + 100 where path_order in (7, 8, 9);
update public.challenges set path_order = 7 where verification_logic = 'humanity_confirmed' and path_order >= 100;
update public.challenges set path_order = 8 where verification_logic = 'wallet_first_withdrawal' and path_order >= 100;
update public.challenges set path_order = 10 where verification_logic = 'first_growth_post_published' and path_order >= 100;
update public.challenges set path_order = 9 where verification_logic = 'wallet_topup_bonus';

-- From when a top-up counts: the completion of «Первый вывод», or else when this quest was taken.
create or replace function public.topup_bonus_since(p_user_id uuid, p_challenge_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(uc.reward_settled_at, uc.updated_at)
       from public.user_challenges uc join public.challenges c on c.id = uc.challenge_id
      where uc.user_id = p_user_id and c.verification_logic = 'wallet_first_withdrawal' and uc.status = 'completed'
      limit 1),
    (select created_at from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id),
    now()
  );
$$;

-- Same contract as settle_user_challenge_rewards, but the Core reward is 10% of the top-ups since topup_bonus_since,
-- at most $5, computed here from the ledger.
create or replace function public.settle_topup_bonus_challenge(p_user_id uuid, p_challenge_id uuid)
returns table (challenge_status text, reward_claimed boolean, rewarded_core_amount numeric, rewarded_wallet_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  existing public.user_challenges%rowtype;
  since timestamptz;
  topped numeric;
  bonus numeric(30, 12);
  reward_key text;
begin
  select * into challenge_row from public.challenges where id = p_challenge_id and is_active = true and verification_logic = 'wallet_topup_bonus';
  if not found then raise exception 'Active top-up bonus challenge was not found.' using errcode = 'P0002'; end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do nothing;
  select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id for update;
  if existing.status = 'completed' then
    return query select existing.status, false, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  since := public.topup_bonus_since(p_user_id, p_challenge_id);
  select coalesce(sum(amount), 0) into topped from public.wallet_ledger
  where user_id = p_user_id and operation_type = 'crypto_deposit' and direction = 'credit' and created_at > since;
  if topped <= 0 then raise exception 'No Wallet top-up after the first withdrawal yet.' using errcode = 'P0001'; end if;
  bonus := least(5, round(topped * 0.10, 2));

  reward_key := 'challenge:' || existing.id::text || ':reward';
  if bonus > 0 then
    update public.core_accounts set balance = balance + bonus, updated_at = now() where user_id = p_user_id;
    if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  end if;
  update public.user_challenges
  set status = 'completed', core_reward_amount = bonus, wallet_reward_amount = 0,
      reward_settled_at = now(), reward_idempotency_key = reward_key, updated_at = now(),
      verification_data = coalesce(verification_data, '{}'::jsonb) || jsonb_build_object('topped_up', topped, 'since', since)
  where id = existing.id;
  return query select 'completed'::text, true, bonus, 0::numeric;
end;
$$;

revoke all on function public.topup_bonus_since(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_topup_bonus_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.topup_bonus_since(uuid, uuid) to service_role;
grant execute on function public.settle_topup_bonus_challenge(uuid, uuid) to service_role;

commit;
