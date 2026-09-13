-- Peer-review payouts use the permanent challenge's numeric Core and Wallet
-- amounts. The legacy reward_amount column remains as a compatibility mirror.

alter table public.peer_review_answers
  add column if not exists core_reward_amount numeric(30, 12) not null default 0,
  add column if not exists wallet_reward_amount numeric(30, 12) not null default 0;

alter table public.peer_review_answers
  drop constraint if exists peer_review_answers_core_reward_amount_check;
alter table public.peer_review_answers
  add constraint peer_review_answers_core_reward_amount_check
  check (core_reward_amount >= 0);

alter table public.peer_review_answers
  drop constraint if exists peer_review_answers_wallet_reward_amount_check;
alter table public.peer_review_answers
  add constraint peer_review_answers_wallet_reward_amount_check
  check (wallet_reward_amount >= 0);

-- Existing reviewer payouts were Core-only. Preserve their settled amount in
-- the new snapshot columns before the settlement function is replaced.
update public.peer_review_answers
set
  core_reward_amount = coalesce(reward_amount, 0),
  wallet_reward_amount = 0
where status = 'settled';

create or replace function public.settle_peer_review_answer(
  p_answer_id uuid,
  p_quality_status text,
  p_reason text default null
)
returns table (
  answer_id uuid,
  reviewer_user_id uuid,
  quality_status text,
  score_delta integer,
  trust_penalty integer,
  reward_status text,
  reward_amount numeric,
  review_score integer
)
language plpgsql security definer set search_path = public
as $$
declare
  answer_row public.peer_review_answers%rowtype;
  progress_row public.user_challenges%rowtype;
  challenge_row public.challenges%rowtype;
  progress jsonb;
  current_score integer;
  next_reward_blocked boolean;
  core_reward numeric(30, 12);
  wallet_reward numeric(30, 12);
  reward numeric(30, 12);
  next_wallet_balance numeric(30, 12);
  wallet_row public.wallet_accounts%rowtype;
  reward_key text;
  delta integer;
  penalty integer;
begin
  if p_quality_status not in ('valid', 'invalid') then
    raise exception 'Invalid peer review quality status.' using errcode = '22023';
  end if;

  select * into answer_row
  from public.peer_review_answers
  where id = p_answer_id
  for update;

  if answer_row.id is null then
    raise exception 'Peer review answer not found.' using errcode = 'P0002';
  end if;

  if answer_row.status <> 'submitted' then
    return query
    select answer_row.id, answer_row.reviewer_user_id, answer_row.quality_status,
      answer_row.score_delta, answer_row.trust_penalty, answer_row.reward_status,
      answer_row.reward_amount, 0;
    return;
  end if;

  select * into challenge_row
  from public.challenges
  where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21'
    and is_active = true;

  if not found then
    raise exception 'Peer reviews challenge is not active.' using errcode = 'P0002';
  end if;

  insert into public.user_challenges (user_id, challenge_id, status, verification_data, updated_at)
  values (answer_row.reviewer_user_id, challenge_row.id, 'accepted', '{}'::jsonb, now())
  on conflict (user_id, challenge_id) do nothing;

  select * into progress_row
  from public.user_challenges
  where user_id = answer_row.reviewer_user_id
    and challenge_id = challenge_row.id
  for update;

  progress := coalesce(progress_row.verification_data, '{}'::jsonb);
  current_score := coalesce((progress->>'review_score')::integer, 0);
  next_reward_blocked := coalesce((progress->>'next_reward_blocked')::boolean, false);

  if p_quality_status = 'valid' then
    delta := 1;
    penalty := 0;
    if next_reward_blocked then
      core_reward := 0;
      wallet_reward := 0;
      next_reward_blocked := false;
    else
      core_reward := coalesce(challenge_row.core_reward_amount, 0);
      wallet_reward := coalesce(challenge_row.wallet_reward_amount, 0);
    end if;
  else
    delta := -2;
    penalty := -1;
    core_reward := 0;
    wallet_reward := 0;
    next_reward_blocked := true;
  end if;

  reward := core_reward + wallet_reward;
  current_score := current_score + delta;

  progress := jsonb_set(progress, '{review_score}', to_jsonb(current_score), true);
  progress := jsonb_set(progress, '{reviews_completed}', to_jsonb(coalesce((progress->>'reviews_completed')::integer, 0) + 1), true);
  if p_quality_status = 'valid' then
    progress := jsonb_set(progress, '{valid_reviews}', to_jsonb(coalesce((progress->>'valid_reviews')::integer, 0) + 1), true);
  else
    progress := jsonb_set(progress, '{invalid_reviews}', to_jsonb(coalesce((progress->>'invalid_reviews')::integer, 0) + 1), true);
  end if;
  progress := jsonb_set(progress, '{next_reward_blocked}', to_jsonb(next_reward_blocked), true);
  if p_reason is not null then
    progress := jsonb_set(progress, '{last_review_reason}', to_jsonb(p_reason), true);
  end if;

  reward_key := 'peer_review:' || answer_row.id::text || ':reward';

  if core_reward > 0 then
    update public.core_accounts
    set balance = balance + core_reward, updated_at = now()
    where user_id = answer_row.reviewer_user_id;
    if not found then
      raise exception 'Core account is not created yet.' using errcode = 'P0002';
    end if;
  end if;

  if wallet_reward > 0 then
    select * into wallet_row
    from public.wallet_accounts
    where user_id = answer_row.reviewer_user_id
    for update;
    if not found then
      raise exception 'Wallet is not created yet.' using errcode = 'P0002';
    end if;
    next_wallet_balance := wallet_row.balance + wallet_reward;
    update public.wallet_accounts
    set balance = next_wallet_balance, updated_at = now()
    where user_id = answer_row.reviewer_user_id;
    insert into public.wallet_ledger (
      user_id, direction, amount, currency_code, operation_type, source_type,
      source_id, balance_after, idempotency_key, metadata
    ) values (
      answer_row.reviewer_user_id, 'credit', wallet_reward, wallet_row.currency_code,
      'challenge_reward', 'challenge', answer_row.id, next_wallet_balance,
      reward_key || ':wallet', jsonb_build_object(
        'challenge_id', challenge_row.id,
        'core_reward_amount', core_reward,
        'wallet_reward_amount', wallet_reward
      )
    ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  if reward > 0 then
    progress := jsonb_set(progress, '{rewards_claimed}', to_jsonb(coalesce((progress->>'rewards_claimed')::integer, 0) + 1), true);
    progress := jsonb_set(progress, '{last_reward_at}', to_jsonb(now()), true);
  end if;

  update public.user_challenges
  set verification_data = progress, updated_at = now()
  where user_id = answer_row.reviewer_user_id
    and challenge_id = challenge_row.id;

  update public.peer_review_answers
  set status = 'settled',
      quality_status = p_quality_status,
      score_delta = delta,
      trust_penalty = penalty,
      reward_status = case when reward > 0 then 'paid' else 'withheld' end,
      core_reward_amount = core_reward,
      wallet_reward_amount = wallet_reward,
      reward_amount = reward,
      notes = case when p_reason is null then notes else coalesce(notes, '') || case when notes is null or notes = '' then '' else E'\n' end || 'Audit: ' || p_reason end,
      settled_at = now(),
      updated_at = now()
  where id = answer_row.id;

  return query
  select answer_row.id, answer_row.reviewer_user_id, p_quality_status, delta, penalty,
    case when reward > 0 then 'paid' else 'withheld' end, reward, current_score;
end;
$$;

revoke all on function public.settle_peer_review_answer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.settle_peer_review_answer(uuid, text, text) to service_role;

create or replace function public.audit_peer_review_answer(
  p_answer_id uuid,
  p_quality_status text,
  p_reason text default null
)
returns table (
  answer_id uuid,
  reviewer_user_id uuid,
  quality_status text,
  score_delta integer,
  trust_penalty integer,
  reward_status text,
  reward_amount numeric
)
language plpgsql security definer set search_path = public
as $$
declare
  answer_row public.peer_review_answers%rowtype;
  progress_row public.user_challenges%rowtype;
  progress jsonb;
  current_score integer;
  core_refund numeric(30, 12);
  wallet_refund numeric(30, 12);
  wallet_row public.wallet_accounts%rowtype;
  actual_wallet_refund numeric(30, 12);
begin
  if p_quality_status not in ('valid', 'invalid') then
    raise exception 'Invalid peer review quality status.' using errcode = '22023';
  end if;

  select * into answer_row
  from public.peer_review_answers
  where id = p_answer_id
  for update;

  if answer_row.id is null then
    raise exception 'Peer review answer not found.' using errcode = 'P0002';
  end if;

  if answer_row.status <> 'settled' or answer_row.quality_status = p_quality_status then
    return query
    select answer_row.id, answer_row.reviewer_user_id, answer_row.quality_status,
      answer_row.score_delta, answer_row.trust_penalty, answer_row.reward_status,
      answer_row.reward_amount;
    return;
  end if;

  select * into progress_row
  from public.user_challenges
  where user_id = answer_row.reviewer_user_id
    and challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21'
  for update;

  progress := coalesce(progress_row.verification_data, '{}'::jsonb);
  current_score := coalesce((progress->>'review_score')::integer, 0);

  if p_quality_status = 'invalid' and answer_row.quality_status = 'valid' then
    core_refund := greatest(0, coalesce(answer_row.core_reward_amount, 0));
    wallet_refund := greatest(0, coalesce(answer_row.wallet_reward_amount, 0));

    if core_refund > 0 then
      update public.core_accounts
      set balance = greatest(0, balance - core_refund), updated_at = now()
      where user_id = answer_row.reviewer_user_id;
    end if;

    if wallet_refund > 0 then
      select * into wallet_row
      from public.wallet_accounts
      where user_id = answer_row.reviewer_user_id
      for update;
      if not found then
        raise exception 'Wallet is not created yet.' using errcode = 'P0002';
      end if;
      actual_wallet_refund := least(wallet_refund, greatest(0, wallet_row.balance));
      if actual_wallet_refund > 0 then
        update public.wallet_accounts
        set balance = balance - actual_wallet_refund, updated_at = now()
        where user_id = answer_row.reviewer_user_id;
        insert into public.wallet_ledger (
          user_id, direction, amount, currency_code, operation_type, source_type,
          source_id, balance_after, idempotency_key, metadata
        ) values (
          answer_row.reviewer_user_id, 'debit', actual_wallet_refund, wallet_row.currency_code,
          'challenge_reward', 'challenge', answer_row.id, wallet_row.balance - actual_wallet_refund,
          'peer_review:' || answer_row.id::text || ':reward:audit:wallet',
          jsonb_build_object('reason', p_reason, 'refund_for', 'peer_review_reward')
        ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
      end if;
    end if;

    current_score := current_score - 3;
    progress := jsonb_set(progress, '{review_score}', to_jsonb(current_score), true);
    progress := jsonb_set(progress, '{invalid_reviews}', to_jsonb(coalesce((progress->>'invalid_reviews')::integer, 0) + 1), true);
    progress := jsonb_set(progress, '{next_reward_blocked}', 'true'::jsonb, true);
    if p_reason is not null then
      progress := jsonb_set(progress, '{last_review_reason}', to_jsonb(p_reason), true);
    end if;

    update public.user_challenges
    set verification_data = progress, updated_at = now()
    where user_id = answer_row.reviewer_user_id
      and challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21';

    update public.peer_review_answers
    set quality_status = 'invalid',
        score_delta = -2,
        trust_penalty = -1,
        reward_status = 'withheld',
        core_reward_amount = 0,
        wallet_reward_amount = 0,
        reward_amount = 0,
        notes = coalesce(notes, '') || case when p_reason is null then '' else case when notes is null or notes = '' then '' else E'\n' end || 'Audit: ' || p_reason end,
        updated_at = now()
    where id = answer_row.id;

    return query
    select answer_row.id, answer_row.reviewer_user_id, 'invalid'::text, -2, -1, 'withheld'::text, 0::numeric;
    return;
  end if;

  return query
  select answer_row.id, answer_row.reviewer_user_id, answer_row.quality_status,
    answer_row.score_delta, answer_row.trust_penalty, answer_row.reward_status,
    answer_row.reward_amount;
end;
$$;

revoke all on function public.audit_peer_review_answer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.audit_peer_review_answer(uuid, text, text) to service_role;
