-- Leader bonus moves to Wallet (decision of the founder, 2026-10-12).
--
-- The bonus stays 10% of the daily Core growth of a direct team member. It is credited to the
-- leader's Wallet (withdrawable) only when BOTH the leader and the member are humanity-confirmed
-- (humanity_level >= 2, see docs/HUMANITY_VERIFICATION_PLAN.md). Otherwise it is credited to Core
-- as before, so no bonus is lost. Until a verification flow fills humanity_verifications, nobody is
-- confirmed and every bonus still goes to Core. The destination can be switched back to Core for
-- everyone with one UPDATE of team_bonus_settings. Amounts are no longer rounded to cents; they
-- are kept with 12 decimals like the rest of Wallet.

-- Humanity confirmation results. Written only by the verification flow (service role).
create table if not exists public.humanity_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  humanity_level smallint not null default 0 check (humanity_level between 0 and 3),
  verified_at timestamptz,
  method text,
  updated_at timestamptz not null default now()
);

alter table public.humanity_verifications enable row level security;
revoke all on public.humanity_verifications from public, anon, authenticated;
grant select, insert, update on public.humanity_verifications to service_role;

create or replace function public.is_humanity_confirmed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select coalesce((select humanity_level >= 2 from public.humanity_verifications where user_id = p_user_id), false);
$;

revoke all on function public.is_humanity_confirmed(uuid) from public, anon, authenticated;
grant execute on function public.is_humanity_confirmed(uuid) to service_role;

create table if not exists public.team_bonus_settings (
  id boolean primary key default true check (id),
  destination text not null default 'wallet' check (destination in ('wallet', 'core')),
  updated_at timestamptz not null default now()
);

insert into public.team_bonus_settings (id) values (true) on conflict (id) do nothing;

alter table public.team_bonus_settings enable row level security;
revoke all on public.team_bonus_settings from public, anon, authenticated;
grant select, insert, update on public.team_bonus_settings to service_role;

alter table public.team_core_growth_rewards
  alter column reward_amount type numeric(30, 12) using reward_amount::numeric(30, 12);
alter table public.team_core_growth_rewards
  add column if not exists wallet_amount numeric(30, 12) not null default 0 check (wallet_amount >= 0),
  add column if not exists core_amount numeric(30, 12) not null default 0 check (core_amount >= 0);

-- Rewards paid before this migration were credited to Core.
update public.team_core_growth_rewards
set core_amount = reward_amount
where wallet_amount = 0 and core_amount = 0;

-- Allow the new ledger operation type without rewriting the whole list by hand.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'wallet_ledger_operation_type_check'
    and conrelid = 'public.wallet_ledger'::regclass;

  if def is not null and position('team_bonus' in def) = 0 then
    alter table public.wallet_ledger drop constraint wallet_ledger_operation_type_check;
    execute 'alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check '
      || replace(def, '''system_adjustment''::text', '''system_adjustment''::text, ''team_bonus''::text');
  end if;
end;
$$;

create or replace function public.settle_team_bonus_for_member(
  p_member_user_id uuid,
  p_bonus_date date default ((now() at time zone 'utc')::date),
  p_settlement_kind text default 'daily',
  p_batch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  membership public.team_memberships%rowtype;
  settings public.team_bonus_settings%rowtype;
  leader_wallet public.wallet_accounts%rowtype;
  source_core_after numeric(30, 12);
  source_core_delta numeric(30, 12);
  reward_amount numeric(30, 12);
  wallet_part numeric(30, 12) := 0;
  core_part numeric(30, 12);
  inserted_reward_id uuid;
  next_wallet_balance numeric(30, 12);
begin
  if p_settlement_kind not in ('daily', 'leader_change') then
    raise exception 'Invalid team bonus settlement kind: %', p_settlement_kind;
  end if;

  select * into membership
  from public.team_memberships
  where member_user_id = p_member_user_id and is_active
  for update;

  if membership.member_user_id is null then
    return;
  end if;

  select balance into source_core_after
  from public.core_accounts
  where user_id = p_member_user_id
  for update;

  if source_core_after is null then
    return;
  end if;

  if membership.leader_user_id is null then
    update public.team_memberships
    set team_bonus_base_balance = source_core_after, team_bonus_base_at = now()
    where member_user_id = p_member_user_id and is_active;
    return;
  end if;

  source_core_delta := source_core_after - membership.team_bonus_base_balance;

  if source_core_delta <= 0 then
    update public.team_memberships
    set team_bonus_base_balance = source_core_after, team_bonus_base_at = now()
    where member_user_id = p_member_user_id and is_active;
    return;
  end if;

  reward_amount := round(source_core_delta * 0.10, 12);

  if reward_amount > 0 then
    select * into settings from public.team_bonus_settings where id = true;

    if found
      and settings.destination = 'wallet'
      and public.is_humanity_confirmed(membership.leader_user_id)
      and public.is_humanity_confirmed(p_member_user_id)
    then
      select * into leader_wallet
      from public.wallet_accounts
      where user_id = membership.leader_user_id
      for update;

      if found then
        wallet_part := reward_amount;
      end if;
    end if;

    core_part := reward_amount - wallet_part;

    insert into public.team_core_growth_rewards (
      bonus_date, source_user_id, leader_user_id, source_core_before, source_core_after,
      source_core_delta, reward_amount, wallet_amount, core_amount, settlement_kind, depth, batch_id
    )
    values (
      p_bonus_date, p_member_user_id, membership.leader_user_id, membership.team_bonus_base_balance,
      source_core_after, source_core_delta, reward_amount, wallet_part, core_part,
      p_settlement_kind, 1, p_batch_id
    )
    on conflict do nothing
    returning id into inserted_reward_id;

    if inserted_reward_id is not null then
      if wallet_part > 0 then
        next_wallet_balance := leader_wallet.balance + wallet_part;
        update public.wallet_accounts
        set balance = next_wallet_balance, updated_at = now()
        where user_id = membership.leader_user_id;

        insert into public.wallet_ledger (
          user_id, direction, amount, currency_code, operation_type, source_type, source_id,
          counterparty_user_id, balance_after, idempotency_key, metadata
        )
        values (
          membership.leader_user_id, 'credit', wallet_part, leader_wallet.currency_code, 'team_bonus', 'system',
          inserted_reward_id, p_member_user_id, next_wallet_balance, 'team_bonus:' || inserted_reward_id::text,
          jsonb_build_object('bonus_date', p_bonus_date, 'source_user_id', p_member_user_id, 'reward_amount', reward_amount, 'core_part', core_part)
        )
        on conflict (idempotency_key) where idempotency_key is not null do nothing;
      end if;

      if core_part > 0 then
        update public.core_accounts
        set balance = balance + core_part, updated_at = now()
        where user_id = membership.leader_user_id;
      end if;
    end if;
  end if;

  update public.team_memberships
  set team_bonus_base_balance = source_core_after, team_bonus_base_at = now()
  where member_user_id = p_member_user_id and is_active;
end;
$$;
