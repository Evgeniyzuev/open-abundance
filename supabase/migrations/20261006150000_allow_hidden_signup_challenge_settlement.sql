-- Fix: /api/auth/claim returned 500 on every session with "Active challenge was not
-- found." The registration challenge (verification_logic = 'signup') has been inactive
-- since 20260722130000_require_auth_after_onboarding, but settle_user_challenge_rewards
-- only accepted active challenges, so the registration reward and the
-- registration_completed event were never recorded. The hidden registration challenge
-- must stay settleable; every other challenge still has to be active.

create or replace function public.settle_user_challenge_rewards(
  p_user_id uuid,
  p_challenge_id uuid
)
returns table (
  challenge_status text,
  reward_claimed boolean,
  rewarded_core_amount numeric,
  rewarded_wallet_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  existing public.user_challenges%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_wallet_balance numeric(30, 12);
  reward_key text;
  milestone_key text;
  milestone_result record;
  claimed boolean := false;
begin
  select * into challenge_row from public.challenges where id = p_challenge_id and (is_active = true or verification_logic = 'signup');
  if not found then raise exception 'Active challenge was not found.' using errcode = 'P0002'; end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update set updated_at = now();
  select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id for update;

  if exists (select 1 from public.challenge_milestones where challenge_id = p_challenge_id and is_active = true) then
    for milestone_key in
      select milestone_key from public.challenge_milestones where challenge_id = p_challenge_id and is_active = true order by step_order
    loop
      select * into milestone_result from public.settle_user_challenge_milestone(p_user_id, p_challenge_id, milestone_key, true);
      claimed := claimed or coalesce(milestone_result.milestone_awarded, false);
    end loop;
    select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id;
    return query select existing.status, claimed, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  if existing.status = 'completed' then
    return query select existing.status, false, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  reward_key := 'challenge:' || existing.id::text || ':reward';
  if challenge_row.core_reward_amount > 0 then
    update public.core_accounts set balance = balance + challenge_row.core_reward_amount, updated_at = now() where user_id = p_user_id;
    if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  end if;
  if challenge_row.wallet_reward_amount > 0 then
    select * into wallet from public.wallet_accounts where user_id = p_user_id for update;
    if not found then raise exception 'Wallet is not created yet.' using errcode = 'P0002'; end if;
    next_wallet_balance := wallet.balance + challenge_row.wallet_reward_amount;
    update public.wallet_accounts set balance = next_wallet_balance, updated_at = now() where user_id = p_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_user_id, 'credit', challenge_row.wallet_reward_amount, wallet.currency_code, 'challenge_reward', 'challenge', existing.id, next_wallet_balance, reward_key || ':wallet', jsonb_build_object('challenge_id', p_challenge_id))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
  update public.user_challenges
  set status = 'completed', core_reward_amount = challenge_row.core_reward_amount, wallet_reward_amount = challenge_row.wallet_reward_amount,
      reward_settled_at = now(), reward_idempotency_key = reward_key, updated_at = now()
  where id = existing.id;
  return query select 'completed'::text, true, challenge_row.core_reward_amount, challenge_row.wallet_reward_amount;
end;
$$;

revoke all on function public.settle_user_challenge_rewards(uuid, uuid) from public, anon, authenticated;
grant execute on function public.settle_user_challenge_rewards(uuid, uuid) to service_role;
