-- "Invite a friend" (has_referral) brings people in, like the referrals_* quests: value 0.8 for the word bonus.

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
    when p_challenge.verification_logic in ('has_referral', 'referral_program') or p_challenge.verification_logic like 'referrals_%' or p_challenge.verification_logic like 'acquisition_%' then 0.8
    when p_challenge.verification_logic = 'humanity_confirmed' or p_challenge.verification_logic like 'trust_event_confirmed:%' then 0.6
    when p_challenge.verification_logic in ('team_task_help_completed', 'first_team_task_done', 'first_wallet_transfer', 'team_contact_active') then 0.5
    when p_challenge.verification_logic like 'daily_goal_%' or p_challenge.verification_logic like 'today_completion_%'
      or p_challenge.verification_logic in ('three_day_focus', 'app_testing_feedback', 'ai_essay_review', 'skill_profile_completed', 'niche_task_chosen') then 0.3
    else 0
  end
$$;
