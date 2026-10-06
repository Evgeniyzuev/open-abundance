-- Fix: settle_user_challenge_milestone and settle_user_challenge_rewards, re-created
-- by 20260923130000_oa_expedition_milestones, still wrote two user_challenges columns
-- that 20260913100000_challenge_rewards_cleanup dropped. Every challenge completion
-- therefore failed with a missing-column error.

create or replace function public.settle_user_challenge_milestone(
  p_user_id uuid,
  p_challenge_id uuid,
  p_milestone_key text,
  p_verified boolean
)
returns table (
  milestone_awarded boolean,
  challenge_status text,
  core_awarded numeric,
  progress_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  milestone_row public.challenge_milestones%rowtype;
  progress_row public.user_challenges%rowtype;
  existing_award public.challenge_milestone_awards%rowtype;
  total_weight numeric;
  completed_weight numeric;
  next_core numeric;
  challenge_completed boolean;
  created_artifact_id uuid;
  artifact_title text;
  artifact_type text;
  artifact_rarity text;
begin
  if p_user_id is null or p_challenge_id is null or p_milestone_key is null or not p_verified then
    raise exception 'Verified user, challenge, milestone are required.' using errcode = '22023';
  end if;

  select * into challenge_row
  from public.challenges
  where id = p_challenge_id and is_active = true;
  if not found then
    raise exception 'Active challenge was not found.' using errcode = 'P0002';
  end if;

  select * into milestone_row
  from public.challenge_milestones
  where challenge_id = p_challenge_id
    and milestone_key = p_milestone_key
    and is_active = true
  for update;
  if not found then
    raise exception 'Active challenge milestone was not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(progress_weight), 0)
    into total_weight
  from public.challenge_milestones
  where challenge_id = p_challenge_id and is_active = true;
  if total_weight <> 100 then
    raise exception 'Active milestone progress weights must total 100.' using errcode = '23514';
  end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update set updated_at = now();

  select * into progress_row
  from public.user_challenges
  where user_id = p_user_id and challenge_id = p_challenge_id
  for update;

  select * into existing_award
  from public.challenge_milestone_awards
  where user_challenge_id = progress_row.id and milestone_id = milestone_row.id;

  if found then
    select coalesce(sum(m.progress_weight), 0), coalesce(sum(case when a.id is not null then m.progress_weight else 0 end), 0)
      into total_weight, completed_weight
    from public.challenge_milestones m
    left join public.challenge_milestone_awards a
      on a.milestone_id = m.id and a.user_challenge_id = progress_row.id
    where m.challenge_id = p_challenge_id and m.is_active = true;
    return query select false, progress_row.status, 0::numeric,
      round(case when total_weight > 0 then completed_weight / total_weight * 100 else 0 end, 2);
    return;
  end if;

  update public.core_accounts
  set balance = balance + milestone_row.core_reward_amount,
      updated_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception 'Core account is not created yet.' using errcode = 'P0002';
  end if;

  if milestone_row.item_reward is not null then
    artifact_title := coalesce(
      nullif(milestone_row.item_reward ->> 'title', ''),
      nullif(milestone_row.title ->> 'en', ''),
      'Expedition find'
    );
    artifact_type := coalesce(nullif(milestone_row.item_reward ->> 'artifact_type', ''), 'expedition_find');
    artifact_rarity := case milestone_row.item_reward ->> 'rarity'
      when 'rare' then 'rare'
      when 'epic' then 'epic'
      when 'system' then 'system'
      else 'common'
    end;
    insert into public.user_artifacts (
      user_id, artifact_type, title, description, rarity, visibility,
      transferable, source_type, source_id, metadata
    ) values (
      p_user_id,
      artifact_type,
      artifact_title,
      nullif(milestone_row.item_reward ->> 'description', ''),
      artifact_rarity,
      'private',
      false,
      'challenge',
      p_challenge_id,
      milestone_row.item_reward
    ) returning id into created_artifact_id;
  end if;

  insert into public.challenge_milestone_awards (
    user_challenge_id,
    milestone_id,
    core_reward_amount,
    artifact_id,
    verification_data,
    idempotency_key
  ) values (
    progress_row.id,
    milestone_row.id,
    milestone_row.core_reward_amount,
    created_artifact_id,
    jsonb_build_object('verification_logic', milestone_row.verification_logic),
    'challenge:' || progress_row.id::text || ':milestone:' || milestone_row.id::text
  );

  select coalesce(sum(m.progress_weight), 0), coalesce(sum(case when a.id is not null then m.progress_weight else 0 end), 0)
    into total_weight, completed_weight
  from public.challenge_milestones m
  left join public.challenge_milestone_awards a
    on a.milestone_id = m.id and a.user_challenge_id = progress_row.id
  where m.challenge_id = p_challenge_id and m.is_active = true;

  challenge_completed := total_weight > 0 and completed_weight >= total_weight;
  select coalesce(sum(core_reward_amount), 0) into next_core
  from public.challenge_milestone_awards
  where user_challenge_id = progress_row.id;

  update public.user_challenges
  set status = case when challenge_completed then 'completed' else 'accepted' end,
      core_reward_amount = next_core,
      reward_settled_at = case when challenge_completed then now() else reward_settled_at end,
      reward_idempotency_key = 'challenge:' || progress_row.id::text || ':milestones',
      updated_at = now()
  where id = progress_row.id;

  return query select true,
    case when challenge_completed then 'completed' else 'accepted' end,
    milestone_row.core_reward_amount,
    round(case when total_weight > 0 then completed_weight / total_weight * 100 else 0 end, 2);
end;
$$;

revoke all on function public.settle_user_challenge_milestone(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.settle_user_challenge_milestone(uuid, uuid, text, boolean) to service_role;

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
  select * into challenge_row from public.challenges where id = p_challenge_id and is_active = true;
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
