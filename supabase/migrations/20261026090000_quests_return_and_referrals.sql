-- Quests (docs/QUEST_PATH_PLAN.md, 2026-10-26, founder decisions):
-- 1) "Come back tomorrow" and "Invite a friend" leave the path: neither can be done on the spot, so they must not hold
--    it up. The app takes both for the person on the first day (GET /api/challenges), so the return reward is waiting
--    and inviting is always at hand.
-- 2) A referrer gets +$0.1 in Core as soon as anyone signs up through their link, on top of the existing rewards for
--    level 2 and the humanity check. Paid once per invited person; the amount lives in referral_reward_settings.

update public.challenges set path_order = null
where id in ('7c2a9f4e-3b1d-4e8a-9f6c-5d4e3b2a1f0e', '1b520e42-d5d2-4eb1-81bf-c16d12d4e246');

-- Close the gap left by step 6, through a high range since the path index is checked row by row.
update public.challenges set path_order = path_order + 100 where path_order >= 7;
update public.challenges set path_order = path_order - 101 where path_order >= 100;

update public.challenges
set unlock_at_completed = 0,
    description = '{"ru":"Возвращайся завтра: тебя ждёт новый квест, а за возвращение придёт награда в Core. Core растёт и пока тебя нет.","en":"Come back tomorrow: a new quest will be waiting, and coming back brings a Core reward. Core keeps growing while you are away."}'::jsonb
where id = '7c2a9f4e-3b1d-4e8a-9f6c-5d4e3b2a1f0e';

update public.challenges
set unlock_at_completed = 0,
    description = '{"ru":"Отправь свою ссылку из профиля тем, кому это пригодится. За каждого, кто зарегистрируется по ней, сразу +$0.1 в Core, за первого приглашённого ещё +$1, а когда он вырастет, придут награды реферальной программы.","en":"Send your link from the profile to people who could use this. Everyone who signs up through it brings +$0.1 in Core at once, the first one another +$1, and the referral program pays more as they grow."}'::jsonb
where id = '1b520e42-d5d2-4eb1-81bf-c16d12d4e246';

alter table public.referral_reward_settings
  add column if not exists signup_core_amount numeric(30, 12) not null default 0.1 check (signup_core_amount >= 0);

alter table public.referral_rewards drop constraint if exists referral_rewards_kind_check;
alter table public.referral_rewards
  add constraint referral_rewards_kind_check check (kind in ('level_2', 'humanity_confirmed', 'signup'));

create or replace function public.pay_referral_reward(
  p_referrer_user_id uuid,
  p_referral_user_id uuid,
  p_kind text,
  p_amount numeric,
  p_prefer_wallet boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_id uuid;
  destination text := 'core';
  wallet_row public.wallet_accounts%rowtype;
  next_balance numeric(30, 12);
  amount_text text := trim(trailing '.' from trim(trailing '0' from p_amount::numeric(30, 6)::text));
begin
  if p_amount is null or p_amount <= 0 or p_referrer_user_id = p_referral_user_id then
    return;
  end if;

  if p_prefer_wallet and public.is_humanity_confirmed(p_referrer_user_id) then
    select * into wallet_row from public.wallet_accounts where user_id = p_referrer_user_id for update;
    if found then
      destination := 'wallet';
    end if;
  end if;

  insert into public.referral_rewards (referrer_user_id, referral_user_id, kind, amount, destination)
  values (p_referrer_user_id, p_referral_user_id, p_kind, p_amount, destination)
  on conflict (referral_user_id, kind) do nothing
  returning id into reward_id;

  if reward_id is null then
    return;
  end if;

  if destination = 'wallet' then
    next_balance := wallet_row.balance + p_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_referrer_user_id;
    insert into public.wallet_ledger (
      user_id, direction, amount, currency_code, operation_type, source_type, source_id,
      counterparty_user_id, balance_after, idempotency_key, metadata
    )
    values (
      p_referrer_user_id, 'credit', p_amount, wallet_row.currency_code, 'referral_reward', 'system', reward_id,
      p_referral_user_id, next_balance, 'referral_reward:' || reward_id::text,
      jsonb_build_object('kind', p_kind, 'referral_user_id', p_referral_user_id)
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  else
    update public.core_accounts set balance = balance + p_amount, updated_at = now() where user_id = p_referrer_user_id;
  end if;

  perform public.create_notification_event(
    'rewards.referral', 'rewards', 'referral_reward', reward_id::text,
    'Награда за приглашённого',
    case p_kind
      when 'signup' then 'По вашей ссылке зарегистрировался новый участник: +$' || amount_text || ' в Core.'
      when 'level_2' then 'Приглашённый участник достиг 2-го уровня: +$' || amount_text || ' в Core.'
      else 'Приглашённый участник подтвердил, что он человек: +$' || amount_text || case destination when 'wallet' then ' в Wallet.' else ' в Core.' end
    end,
    '/?view=people.profile', array[p_referrer_user_id],
    'referral-reward:' || reward_id::text, jsonb_build_object('kind', p_kind, 'destination', destination)
  );
end;
$$;

revoke all on function public.pay_referral_reward(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.pay_referral_reward(uuid, uuid, text, numeric, boolean) to service_role;

create or replace function public.referral_signup_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.referral_reward_settings%rowtype;
begin
  select * into settings from public.referral_reward_settings where id = true;
  if not found or not settings.enabled or new.referrer_user_id is null then
    return new;
  end if;
  perform public.pay_referral_reward(new.referrer_user_id, new.referral_user_id, 'signup', settings.signup_core_amount, false);
  return new;
end;
$$;

revoke all on function public.referral_signup_reward() from public, anon, authenticated;

drop trigger if exists referral_signup_reward on public.referral_edges;
create trigger referral_signup_reward
after insert on public.referral_edges
for each row execute function public.referral_signup_reward();
