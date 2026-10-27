-- Founder decisions 2026-10-27: «Вывод и пополнение» is one two-step quest after «Я не робот»:
--   7 «Я не робот» (pays $1 to Wallet, so the withdrawal needs no own money and has no $1 minimum)
--   8 «Вывод и пополнение»: step 1 any withdrawal (without «Я не робот» the first one starts at $1, lib/withdrawalGate.ts),
--     step 2 any top-up after the first withdrawal. Reward at the end: Core +$1 plus 10% of those top-ups, at most $5.
--   9 «Опубликуй первый результат»
begin;

-- Reuses the row created in 20261027120000; nobody has progress on it yet.
update public.challenges set
  description = '{"ru": "Два шага: выведи из Wallet любую сумму, потом пополни Wallet на любую сумму. Так ты сам увидишь, что деньги здесь настоящие и двигаются в обе стороны. Награда: Core +$1 и ещё 10% от пополнения, до $5.", "en": "Two steps: withdraw any amount from your Wallet, then top your Wallet up with any amount. You will see for yourself that the money here is real and moves both ways. Reward: Core +$1 plus 10% of the top-up, up to $5."}',
  instructions = '{"ru": "1. Wallet → Вывести: выведи любую сумму на свой кошелёк. Без «Я не робот» первый вывод — от $1. 2. Wallet → Пополнить: пополни на любую сумму. Считаются пополнения после первого вывода. Затем нажми «Проверить».", "en": "1. Wallet → Withdraw: withdraw any amount to your own wallet. Without «I''m not a robot» the first withdrawal starts at $1. 2. Wallet → Top up: add any amount. Top-ups after the first withdrawal count. Then tap Check."}',
  requirements = '{"ru": "Есть вывод из Wallet и после него пополнение. Бонус: 10% от пополнений после первого вывода, не больше $5.", "en": "A withdrawal from Wallet and a top-up after it. Bonus: 10% of the top-ups after the first withdrawal, at most $5."}',
  verification_logic = 'wallet_withdraw_then_topup',
  core_reward_amount = 1.00
where id = '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a07';

update public.challenges set path_order = path_order + 100 where path_order in (7, 8);
update public.challenges set path_order = 7 where verification_logic = 'humanity_confirmed' and path_order >= 100;
update public.challenges set path_order = 8 where verification_logic = 'wallet_withdraw_then_topup' and path_order >= 100;

-- When the person first withdrew from Wallet (null: not yet). Top-ups after it count for step 2.
create or replace function public.first_wallet_withdrawal_at(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(created_at) from public.wallet_ledger
  where user_id = p_user_id and operation_type = 'crypto_withdrawal' and direction = 'debit';
$$;

-- Same contract as settle_user_challenge_rewards. Core reward = the quest's fixed reward + 10% of the top-ups after the
-- first withdrawal, the bonus at most $5, computed here from the ledger.
create or replace function public.settle_withdraw_topup_challenge(p_user_id uuid, p_challenge_id uuid)
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
  reward numeric(30, 12);
  reward_key text;
begin
  select * into challenge_row from public.challenges where id = p_challenge_id and is_active = true and verification_logic = 'wallet_withdraw_then_topup';
  if not found then raise exception 'Active withdraw-and-top-up challenge was not found.' using errcode = 'P0002'; end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do nothing;
  select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id for update;
  if existing.status = 'completed' then
    return query select existing.status, false, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  since := public.first_wallet_withdrawal_at(p_user_id);
  if since is null then raise exception 'No withdrawal from Wallet yet.' using errcode = 'P0001'; end if;
  select coalesce(sum(amount), 0) into topped from public.wallet_ledger
  where user_id = p_user_id and operation_type = 'crypto_deposit' and direction = 'credit' and created_at > since;
  if topped <= 0 then raise exception 'No Wallet top-up after the first withdrawal yet.' using errcode = 'P0001'; end if;
  reward := challenge_row.core_reward_amount + least(5, round(topped * 0.10, 2));

  reward_key := 'challenge:' || existing.id::text || ':reward';
  update public.core_accounts set balance = balance + reward, updated_at = now() where user_id = p_user_id;
  if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  update public.user_challenges
  set status = 'completed', core_reward_amount = reward, wallet_reward_amount = 0,
      reward_settled_at = now(), reward_idempotency_key = reward_key, updated_at = now(),
      verification_data = coalesce(verification_data, '{}'::jsonb) || jsonb_build_object('topped_up', topped, 'first_withdrawal_at', since)
  where id = existing.id;
  return query select 'completed'::text, true, reward, 0::numeric;
end;
$$;

revoke all on function public.first_wallet_withdrawal_at(uuid) from public, anon, authenticated;
revoke all on function public.settle_withdraw_topup_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.first_wallet_withdrawal_at(uuid) to service_role;
grant execute on function public.settle_withdraw_topup_challenge(uuid, uuid) to service_role;

commit;
