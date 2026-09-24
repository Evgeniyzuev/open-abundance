-- Challenge rewards are stored as amounts. Account names and currency formatting
-- belong to the application UI.
--
-- Legacy challenge reward columns stay during the expand/contract rollout so the
-- currently deployed API keeps working until the new application version is live.

alter table public.challenges
  add column if not exists core_reward_amount numeric(20, 2) not null default 0,
  add column if not exists wallet_reward_amount numeric(20, 2) not null default 0;

alter table public.challenges
  drop constraint if exists challenges_core_reward_amount_check;
alter table public.challenges
  add constraint challenges_core_reward_amount_check
  check (core_reward_amount >= 0);

alter table public.challenges
  drop constraint if exists challenges_wallet_reward_amount_check;
alter table public.challenges
  add constraint challenges_wallet_reward_amount_check
  check (wallet_reward_amount >= 0);

with reward_source as (
  select
    id,
    coalesce(
      reward_amount,
      replace(
        substring(
          coalesce(
            reward_label ->> 'en',
            reward_label ->> 'ru',
            case when jsonb_typeof(reward_label) = 'string' then reward_label #>> '{}' end,
            ''
          )
          from '([0-9]+([.,][0-9]+)?)'
        ),
        ',',
        '.'
      )::numeric,
      0
    ) as amount,
    coalesce(reward_account, 'core') as account
  from public.challenges
)
update public.challenges challenge
set
  core_reward_amount = case when source.account = 'wallet' then 0 else source.amount end,
  wallet_reward_amount = case when source.account = 'wallet' then source.amount else 0 end
from reward_source source
where source.id = challenge.id;

-- The permanent Peer reviews challenge uses its base reward for every valid
-- review. Keep the legacy value synchronized while the old settlement function
-- remains available to the deployed application.
update public.challenges
set review_reward_amount = core_reward_amount
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21';

alter table public.user_challenges
  add column if not exists core_reward_amount numeric(30, 12) not null default 0,
  add column if not exists wallet_reward_amount numeric(30, 12) not null default 0;

alter table public.user_challenges
  drop constraint if exists user_challenges_core_reward_amount_check;
alter table public.user_challenges
  add constraint user_challenges_core_reward_amount_check
  check (core_reward_amount >= 0);

alter table public.user_challenges
  drop constraint if exists user_challenges_wallet_reward_amount_check;
alter table public.user_challenges
  add constraint user_challenges_wallet_reward_amount_check
  check (wallet_reward_amount >= 0);

update public.user_challenges
set
  core_reward_amount = case when reward_account = 'core' then coalesce(reward_amount, 0) else 0 end,
  wallet_reward_amount = case when reward_account = 'wallet' then coalesce(reward_amount, 0) else 0 end
where status = 'completed';

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
begin
  if p_user_id is null or p_challenge_id is null then
    raise exception 'User and challenge are required.' using errcode = '22023';
  end if;

  select *
  into challenge_row
  from public.challenges
  where id = p_challenge_id
    and is_active = true;

  if not found then
    raise exception 'Active challenge was not found.' using errcode = 'P0002';
  end if;

  if challenge_row.core_reward_amount < 0 or challenge_row.wallet_reward_amount < 0 then
    raise exception 'Invalid challenge reward.' using errcode = '22023';
  end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update
    set updated_at = now();

  select *
  into existing
  from public.user_challenges
  where user_id = p_user_id
    and challenge_id = p_challenge_id
  for update;

  if existing.status = 'completed' then
    return query
    select
      existing.status,
      false,
      existing.core_reward_amount,
      existing.wallet_reward_amount;
    return;
  end if;

  reward_key := 'challenge:' || existing.id::text || ':reward';

  if challenge_row.core_reward_amount > 0 then
    update public.core_accounts
    set balance = balance + challenge_row.core_reward_amount,
        updated_at = now()
    where user_id = p_user_id;

    if not found then
      raise exception 'Core account is not created yet.' using errcode = 'P0002';
    end if;
  end if;

  if challenge_row.wallet_reward_amount > 0 then
    select *
    into wallet
    from public.wallet_accounts
    where user_id = p_user_id
    for update;

    if not found then
      raise exception 'Wallet is not created yet.' using errcode = 'P0002';
    end if;

    next_wallet_balance := wallet.balance + challenge_row.wallet_reward_amount;

    update public.wallet_accounts
    set balance = next_wallet_balance,
        updated_at = now()
    where user_id = p_user_id;

    insert into public.wallet_ledger (
      user_id,
      direction,
      amount,
      currency_code,
      operation_type,
      source_type,
      source_id,
      balance_after,
      idempotency_key,
      metadata
    )
    values (
      p_user_id,
      'credit',
      challenge_row.wallet_reward_amount,
      wallet.currency_code,
      'challenge_reward',
      'challenge',
      existing.id,
      next_wallet_balance,
      reward_key || ':wallet',
      jsonb_build_object(
        'challenge_id', p_challenge_id,
        'core_reward_amount', challenge_row.core_reward_amount,
        'wallet_reward_amount', challenge_row.wallet_reward_amount
      )
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  update public.user_challenges
  set status = 'completed',
      core_reward_amount = challenge_row.core_reward_amount,
      wallet_reward_amount = challenge_row.wallet_reward_amount,
      -- Transitional mirrors for the deployed metrics functions.
      reward_account = case
        when challenge_row.core_reward_amount > 0 then 'core'
        when challenge_row.wallet_reward_amount > 0 then 'wallet'
        else 'core'
      end,
      reward_amount = case
        when challenge_row.core_reward_amount > 0 then challenge_row.core_reward_amount
        else challenge_row.wallet_reward_amount
      end,
      reward_settled_at = now(),
      reward_idempotency_key = reward_key,
      updated_at = now()
  where id = existing.id;

  return query
  select
    'completed'::text,
    true,
    challenge_row.core_reward_amount,
    challenge_row.wallet_reward_amount;
end;
$$;

revoke all on function public.settle_user_challenge_rewards(uuid, uuid) from public, anon, authenticated;
grant execute on function public.settle_user_challenge_rewards(uuid, uuid) to service_role;

-- Compatibility wrapper for the application version that still sends an
-- account and amount. The database values are authoritative and the supplied
-- legacy values are intentionally ignored.
create or replace function public.complete_user_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_reward_account text,
  p_reward_amount numeric
)
returns table (
  challenge_status text,
  reward_claimed boolean,
  rewarded_account text,
  rewarded_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  settlement record;
begin
  select *
  into settlement
  from public.settle_user_challenge_rewards(p_user_id, p_challenge_id);

  return query
  select
    settlement.challenge_status,
    settlement.reward_claimed,
    case when settlement.rewarded_core_amount > 0 then 'core'::text else 'wallet'::text end,
    case when settlement.rewarded_core_amount > 0 then settlement.rewarded_core_amount else settlement.rewarded_wallet_amount end;
end;
$$;

revoke all on function public.complete_user_challenge(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.complete_user_challenge(uuid, uuid, text, numeric) to service_role;

-- Feed review metadata is a derived display value. Keep it tied to the
-- challenge amounts instead of copying a hard-coded reward into the feed RPC.
create or replace function public.set_project_review_reward_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.core_reward_amount + c.wallet_reward_amount
  into new.challenge_reward_amount
  from public.challenge_feedback_submissions submission
  join public.challenges c on c.id = submission.challenge_id
  where submission.id = new.feedback_submission_id;

  return new;
end;
$$;

drop trigger if exists set_project_review_reward_amount on public.feed_project_review_metadata;
create trigger set_project_review_reward_amount
before insert or update of feedback_submission_id, challenge_reward_amount
on public.feed_project_review_metadata
for each row execute function public.set_project_review_reward_amount();
