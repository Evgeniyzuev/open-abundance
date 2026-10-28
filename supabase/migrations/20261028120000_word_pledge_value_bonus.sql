-- "Price of your word": the bonus depends on the quest and is paid from missed deposits (Evgen, 2026-10-28), so it
-- cannot be farmed on easy steps and does not inflate Core.
-- share = value × difficulty × duration, from 0 to 1:
--   value: what the quest brings to Open Abundance's growth. Top-ups, Wallet that stays, internal purchases,
--     sales, fulfilled wishes: 1.0; confirmed people brought in and publications: 0.8; trust ("I'm not a robot",
--     proofs): 0.6; help to others and lead tasks: 0.5; focus streaks, testing, essays, skills: 0.3;
--     onboarding steps (notifications, codes, first wish, come back tomorrow, AI question): 0, no word possible.
--   difficulty: the quest's difficulty level, 1..5 of 5. duration: 0.5 + 0.5 × min(quest days, 60) / 60.
-- Bonus when the word is kept: up to 10% × share of the deposit, paid from the pool of missed deposits
-- (missed minus bonuses already paid above the floor); at least 2% × share, which the reward fund guarantees at start.
-- Deposit cap from the quest's value: 10 × the quest's own reward, from $1 to $20.
-- A person gives their word on each quest only once, ever.

alter table public.word_pledges add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;
update public.word_pledges p set challenge_id = uc.challenge_id from public.user_challenges uc where uc.id = p.user_challenge_id and p.challenge_id is null;
create unique index if not exists word_pledges_user_challenge_once_idx on public.word_pledges (user_id, challenge_id) where challenge_id is not null;

alter table public.word_pledges drop constraint if exists word_pledges_bonus_percent_check;
alter table public.word_pledges add constraint word_pledges_bonus_percent_check check (bonus_percent >= 0 and bonus_percent <= 10);
alter table public.word_pledges add column if not exists value_share numeric(6, 4) not null default 0 check (value_share >= 0 and value_share <= 1);

create or replace function public.word_pledge_value(p_challenge public.challenges)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_challenge.verification_logic in ('wallet_first_deposit', 'wallet_net_deposit_20', 'first_wallet_to_core', 'afterburn_over_5', 'first_wish_fulfilled', 'first_internal_purchase')
      or p_challenge.verification_logic like 'stay_streak_%'
      or p_challenge.verification_logic like 'growth_%'
      or p_challenge.verification_logic like 'sales_total_%'
      or p_challenge.verification_logic like 'business_%'
      or p_challenge.verification_logic in ('first_sale', 'first_marketplace_listing') then 1.0
    when p_challenge.verification_logic like 'referrals_%' or p_challenge.verification_logic like 'acquisition_%' then 0.8
    when p_challenge.verification_logic = 'humanity_confirmed' or p_challenge.verification_logic like 'trust_event_confirmed:%' then 0.6
    when p_challenge.verification_logic in ('team_task_help_completed', 'first_team_task_done', 'first_wallet_transfer', 'team_contact_active') then 0.5
    when p_challenge.verification_logic like 'daily_goal_%' or p_challenge.verification_logic like 'today_completion_%'
      or p_challenge.verification_logic in ('three_day_focus', 'app_testing_feedback', 'ai_essay_review', 'skill_profile_completed', 'niche_task_chosen') then 0.3
    else 0
  end
$$;

create or replace function public.word_pledge_share(p_challenge public.challenges)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    public.word_pledge_value(p_challenge)
      * least(greatest(coalesce(p_challenge.difficulty_level, 1), 1), 5) / 5.0
      * (0.5 + 0.5 * least(coalesce(p_challenge.duration_days, 1), 60) / 60.0),
    4)
$$;

create or replace function public.word_pledge_max_amount(p_challenge public.challenges)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(20, greatest(1, floor(10 * (coalesce(p_challenge.core_reward_amount, 0) + coalesce(p_challenge.wallet_reward_amount, 0)))))
$$;

-- The person's accepted quests they can still give their word on, with the bonus percent for each.
create or replace function public.word_pledge_quotes(p_user_id uuid)
returns table (user_challenge_id uuid, title jsonb, max_percent numeric, min_percent numeric, max_amount numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select uc.id, c.title, round(10 * public.word_pledge_share(c), 1), round(2 * public.word_pledge_share(c), 1), public.word_pledge_max_amount(c)
  from public.user_challenges uc
  join public.challenges c on c.id = uc.challenge_id
  where uc.user_id = p_user_id and uc.status = 'accepted'
    and public.word_pledge_share(c) > 0
    and not exists (select 1 from public.word_pledges p where p.user_id = p_user_id and (p.challenge_id = uc.challenge_id or p.user_challenge_id = uc.id))
  order by public.word_pledge_share(c) desc, uc.created_at desc
$$;

create or replace function public.create_word_pledge(
  p_user_id uuid,
  p_user_challenge_id uuid,
  p_goal text,
  p_amount numeric,
  p_deadline_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(30, 12);
  v_id uuid;
  v_challenge public.challenges%rowtype;
  v_share numeric;
begin
  if p_user_id is null then return jsonb_build_object('error', 'sign_in'); end if;
  perform public.settle_word_pledges(p_user_id);
  if p_amount is null or p_amount < 1 or p_amount > 20 then return jsonb_build_object('error', 'amount'); end if;
  if p_deadline_at < now() + interval '12 hours' or p_deadline_at > now() + interval '15 days' then
    return jsonb_build_object('error', 'deadline');
  end if;
  select c.* into v_challenge from public.user_challenges uc join public.challenges c on c.id = uc.challenge_id
    where uc.id = p_user_challenge_id and uc.user_id = p_user_id and uc.status = 'accepted';
  if not found then return jsonb_build_object('error', 'quest'); end if;
  v_share := public.word_pledge_share(v_challenge);
  if v_share <= 0 then return jsonb_build_object('error', 'no_value'); end if;
  if p_amount > public.word_pledge_max_amount(v_challenge) then return jsonb_build_object('error', 'amount_cap'); end if;
  if exists (select 1 from public.word_pledges where user_id = p_user_id and (challenge_id = v_challenge.id or user_challenge_id = p_user_challenge_id)) then
    return jsonb_build_object('error', 'quest_used');
  end if;
  if exists (select 1 from public.word_pledges where user_id = p_user_id and status = 'active') then
    return jsonb_build_object('error', 'active');
  end if;

  select balance into v_balance from public.wallet_accounts where user_id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then return jsonb_build_object('error', 'balance'); end if;

  insert into public.word_pledges (user_id, user_challenge_id, challenge_id, goal, amount, value_share, bonus_percent, deadline_at)
    values (p_user_id, p_user_challenge_id, v_challenge.id, left(btrim(p_goal), 300), round(p_amount, 2), v_share, round(10 * v_share, 1), p_deadline_at)
    returning id into v_id;
  update public.wallet_accounts set balance = balance - round(p_amount, 2), updated_at = now() where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_user_id, 'debit', round(p_amount, 2), '$', 'word_pledge_hold', 'word_pledge', v_id, v_balance,
      'word_pledge:' || v_id::text || ':hold', jsonb_build_object('pledge_id', v_id, 'user_challenge_id', p_user_challenge_id, 'value_share', v_share));
  return jsonb_build_object('pledge_id', v_id, 'max_percent', round(10 * v_share, 1));
end;
$$;

revoke all on function public.word_pledge_quotes(uuid) from public, anon, authenticated;
grant execute on function public.word_pledge_quotes(uuid) to service_role;
revoke all on function public.create_word_pledge(uuid, uuid, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.create_word_pledge(uuid, uuid, text, numeric, timestamptz) to service_role;

-- Settlement with the bonus from the pool of missed deposits. bonus_percent holds "up to" while active and the real
-- percent once kept.
create or replace function public.settle_word_pledges(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pledge public.word_pledges%rowtype;
  v_done timestamptz;
  v_balance numeric(30, 12);
  v_floor numeric;
  v_full numeric;
  v_pool numeric;
  v_bonus numeric(30, 12);
  v_count integer := 0;
begin
  for v_pledge in
    select * from public.word_pledges
    where status = 'active' and (p_user_id is null or user_id = p_user_id)
    order by created_at
    for update skip locked
  loop
    select case when uc.status = 'completed' then uc.updated_at end into v_done
      from public.user_challenges uc where uc.id = v_pledge.user_challenge_id;

    if v_done is not null and v_done <= v_pledge.deadline_at then
      v_floor := round(v_pledge.amount * v_pledge.value_share * 0.02, 2);
      v_full := round(v_pledge.amount * v_pledge.value_share * 0.10, 2);
      -- What missed deposits have brought in, minus what was already paid above the floor.
      select coalesce(sum(amount) filter (where status = 'missed'), 0)
           - coalesce(sum(greatest(bonus_amount - round(amount * value_share * 0.02, 2), 0)) filter (where status = 'kept'), 0)
        into v_pool from public.word_pledges;
      v_bonus := greatest(v_floor, least(v_full, v_floor + greatest(v_pool, 0)));
      update public.wallet_accounts set balance = balance + v_pledge.amount, updated_at = now()
        where user_id = v_pledge.user_id returning balance into v_balance;
      insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
        values (v_pledge.user_id, 'credit', v_pledge.amount, '$', 'word_pledge_release', 'word_pledge', v_pledge.id, v_balance,
          'word_pledge:' || v_pledge.id::text || ':release', jsonb_build_object('pledge_id', v_pledge.id, 'bonus', v_bonus))
        on conflict do nothing;
      if v_bonus > 0 then
        insert into public.core_accounts (user_id, balance) values (v_pledge.user_id, v_bonus)
          on conflict (user_id) do update set balance = public.core_accounts.balance + excluded.balance, updated_at = now();
      end if;
      update public.word_pledges
        set status = 'kept', bonus_amount = v_bonus, bonus_percent = least(10, round(100 * v_bonus / v_pledge.amount, 1)), settled_at = now()
        where id = v_pledge.id;
      v_count := v_count + 1;
    elsif now() > v_pledge.deadline_at then
      update public.word_pledges set status = 'missed', settled_at = now() where id = v_pledge.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.settle_word_pledges(uuid) from public, anon, authenticated;
grant execute on function public.settle_word_pledges(uuid) to service_role;
