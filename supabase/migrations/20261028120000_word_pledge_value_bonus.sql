-- "Price of your word": the bonus depends on the quest (Evgen, 2026-10-28), so it cannot be farmed on easy steps.
-- percent = 30 × value × difficulty × duration, capped at 30%:
--   value: what the quest brings to Open Abundance's growth. Top-ups, Wallet that stays, internal purchases,
--     sales, fulfilled wishes: 1.0; confirmed people brought in and publications: 0.8; trust ("I'm not a robot",
--     proofs): 0.6; help to others and lead tasks: 0.5; focus streaks, testing, essays, skills: 0.3;
--     onboarding steps (notifications, codes, first wish, come back tomorrow, AI question): 0, no bonus.
--   difficulty: the quest's difficulty level, 1..5 of 5. duration: 0.5 + 0.5 × min(quest days, 60) / 60.
-- The percent is fixed when the word is given. A person gives their word on each quest only once, ever.

alter table public.word_pledges add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;
update public.word_pledges p set challenge_id = uc.challenge_id from public.user_challenges uc where uc.id = p.user_challenge_id and p.challenge_id is null;
create unique index if not exists word_pledges_user_challenge_once_idx on public.word_pledges (user_id, challenge_id) where challenge_id is not null;

alter table public.word_pledges drop constraint if exists word_pledges_bonus_percent_check;
alter table public.word_pledges add constraint word_pledges_bonus_percent_check check (bonus_percent >= 0 and bonus_percent <= 30);

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

create or replace function public.word_pledge_percent(p_challenge public.challenges)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(30, round(
    30 * public.word_pledge_value(p_challenge)
      * least(greatest(coalesce(p_challenge.difficulty_level, 1), 1), 5) / 5.0
      * (0.5 + 0.5 * least(coalesce(p_challenge.duration_days, 1), 60) / 60.0),
    1))
$$;

-- The person's accepted quests they can still give their word on, with the bonus percent for each.
create or replace function public.word_pledge_quotes(p_user_id uuid)
returns table (user_challenge_id uuid, title jsonb, bonus_percent numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select uc.id, c.title, public.word_pledge_percent(c)
  from public.user_challenges uc
  join public.challenges c on c.id = uc.challenge_id
  where uc.user_id = p_user_id and uc.status = 'accepted'
    and public.word_pledge_percent(c) > 0
    and not exists (select 1 from public.word_pledges p where p.user_id = p_user_id and (p.challenge_id = uc.challenge_id or p.user_challenge_id = uc.id))
  order by public.word_pledge_percent(c) desc, uc.created_at desc
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
  v_percent numeric;
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
  v_percent := public.word_pledge_percent(v_challenge);
  if v_percent <= 0 then return jsonb_build_object('error', 'no_value'); end if;
  if exists (select 1 from public.word_pledges where user_id = p_user_id and (challenge_id = v_challenge.id or user_challenge_id = p_user_challenge_id)) then
    return jsonb_build_object('error', 'quest_used');
  end if;
  if exists (select 1 from public.word_pledges where user_id = p_user_id and status = 'active') then
    return jsonb_build_object('error', 'active');
  end if;

  select balance into v_balance from public.wallet_accounts where user_id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then return jsonb_build_object('error', 'balance'); end if;

  insert into public.word_pledges (user_id, user_challenge_id, challenge_id, goal, amount, bonus_percent, deadline_at)
    values (p_user_id, p_user_challenge_id, v_challenge.id, left(btrim(p_goal), 300), round(p_amount, 2), v_percent, p_deadline_at)
    returning id into v_id;
  update public.wallet_accounts set balance = balance - round(p_amount, 2), updated_at = now() where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_user_id, 'debit', round(p_amount, 2), '$', 'word_pledge_hold', 'word_pledge', v_id, v_balance,
      'word_pledge:' || v_id::text || ':hold', jsonb_build_object('pledge_id', v_id, 'user_challenge_id', p_user_challenge_id, 'bonus_percent', v_percent));
  return jsonb_build_object('pledge_id', v_id, 'bonus_percent', v_percent);
end;
$$;

revoke all on function public.word_pledge_quotes(uuid) from public, anon, authenticated;
grant execute on function public.word_pledge_quotes(uuid) to service_role;
revoke all on function public.create_word_pledge(uuid, uuid, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.create_word_pledge(uuid, uuid, text, numeric, timestamptz) to service_role;
