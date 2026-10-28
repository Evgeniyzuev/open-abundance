-- "Price of your word" (Evgen, 2026-10-28; lib/wordPledge.ts, docs/SMALL_WISHES_AND_LEADS_PLAN.md): a person promises to
-- finish one of their accepted quests by a deadline and puts a deposit from their Wallet on it. If the quest is completed
-- by the deadline, the deposit comes back to the Wallet and a bonus (a share of the deposit) is added to Core. If not,
-- the deposit stays in the Open Abundance reward fund, which pays these bonuses. Completion is checked by the quest's own
-- verification, never by self-report, so the bonus cannot be farmed. One active pledge per person, one per quest,
-- bonus fixed at 10% of the deposit (set here, not by the client).

alter table public.wallet_ledger drop constraint if exists wallet_ledger_operation_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check check (operation_type in (
  'marketplace_escrow_hold', 'marketplace_payment', 'marketplace_refund', 'wallet_transfer', 'wallet_core_topup',
  'challenge_reward', 'crypto_deposit', 'crypto_withdrawal', 'system_adjustment', 'referral_reward',
  'system_shop_purchase', 'internal_turnover_fee', 'team_bonus', 'p2p_escrow_hold', 'p2p_escrow_release',
  'p2p_escrow_refund', 'p2p_compensation', 'p2p_recovery', 'p2p_collateral_hold', 'p2p_collateral_release',
  'word_pledge_hold', 'word_pledge_release'
));

alter table public.wallet_ledger drop constraint if exists wallet_ledger_source_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_source_type_check check (source_type in (
  'challenge', 'core_topup', 'marketplace_deal', 'wallet_transfer', 'crypto_deposit', 'crypto_withdrawal', 'p2p_ad',
  'p2p_order', 'p2p_recovery', 'p2p_collateral', 'manual', 'system', 'word_pledge'
));

create table if not exists public.word_pledges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_challenge_id uuid not null references public.user_challenges(id) on delete cascade,
  goal text not null check (char_length(goal) between 1 and 300),
  amount numeric(30, 12) not null check (amount >= 1 and amount <= 20),
  bonus_percent numeric(6, 2) not null check (bonus_percent >= 0 and bonus_percent <= 50),
  deadline_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'kept', 'missed')),
  bonus_amount numeric(30, 12) not null default 0 check (bonus_amount >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create unique index if not exists word_pledges_one_per_quest_idx on public.word_pledges (user_challenge_id);
create unique index if not exists word_pledges_one_active_idx on public.word_pledges (user_id) where status = 'active';
create index if not exists word_pledges_user_created_idx on public.word_pledges (user_id, created_at desc);
create index if not exists word_pledges_active_deadline_idx on public.word_pledges (deadline_at) where status = 'active';

alter table public.word_pledges enable row level security;
drop policy if exists "Own word pledges" on public.word_pledges;
create policy "Own word pledges" on public.word_pledges for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.word_pledges to authenticated;
grant select, insert, update on public.word_pledges to service_role;

-- Settles pledges: kept when the quest was completed by the deadline, missed when the deadline passed without it.
-- A signed-in person settles only their own; the service role (cron) settles everyone's.
create or replace function public.settle_word_pledges(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pledge public.word_pledges%rowtype;
  v_done timestamptz;
  v_balance numeric(30, 12);
  v_bonus numeric(30, 12);
  v_count integer := 0;
begin
  if v_uid is not null then p_user_id := v_uid; end if;
  for v_pledge in
    select * from public.word_pledges
    where status = 'active' and (p_user_id is null or user_id = p_user_id)
    order by created_at
    for update skip locked
  loop
    select case when uc.status = 'completed' then uc.updated_at end into v_done
      from public.user_challenges uc where uc.id = v_pledge.user_challenge_id;

    if v_done is not null and v_done <= v_pledge.deadline_at then
      v_bonus := round(v_pledge.amount * v_pledge.bonus_percent / 100, 2);
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
      update public.word_pledges set status = 'kept', bonus_amount = v_bonus, settled_at = now() where id = v_pledge.id;
      v_count := v_count + 1;
    elsif now() > v_pledge.deadline_at then
      update public.word_pledges set status = 'missed', settled_at = now() where id = v_pledge.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Puts the deposit on one of the person's accepted quests. Returns the pledge id or an error.
create or replace function public.create_word_pledge(
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
  v_uid uuid := auth.uid();
  v_balance numeric(30, 12);
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('error', 'Sign in first.'); end if;
  perform public.settle_word_pledges(v_uid);
  if p_amount is null or p_amount < 1 or p_amount > 20 then return jsonb_build_object('error', 'Deposit must be from 1 to 20.'); end if;
  if p_deadline_at < now() + interval '12 hours' or p_deadline_at > now() + interval '15 days' then
    return jsonb_build_object('error', 'Deadline must be from 12 hours to 15 days ahead.');
  end if;
  if not exists (select 1 from public.user_challenges where id = p_user_challenge_id and user_id = v_uid and status = 'accepted') then
    return jsonb_build_object('error', 'Pick one of your accepted quests.');
  end if;
  if exists (select 1 from public.word_pledges where user_challenge_id = p_user_challenge_id) then
    return jsonb_build_object('error', 'This quest already had a promise.');
  end if;
  if exists (select 1 from public.word_pledges where user_id = v_uid and status = 'active') then
    return jsonb_build_object('error', 'You already have an active promise.');
  end if;

  select balance into v_balance from public.wallet_accounts where user_id = v_uid for update;
  if v_balance is null or v_balance < p_amount then return jsonb_build_object('error', 'Not enough in Wallet.'); end if;

  insert into public.word_pledges (user_id, user_challenge_id, goal, amount, bonus_percent, deadline_at)
    values (v_uid, p_user_challenge_id, left(btrim(p_goal), 300), round(p_amount, 2), 10, p_deadline_at)
    returning id into v_id;
  update public.wallet_accounts set balance = balance - round(p_amount, 2), updated_at = now() where user_id = v_uid returning balance into v_balance;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (v_uid, 'debit', round(p_amount, 2), '$', 'word_pledge_hold', 'word_pledge', v_id, v_balance,
      'word_pledge:' || v_id::text || ':hold', jsonb_build_object('pledge_id', v_id, 'user_challenge_id', p_user_challenge_id));
  return jsonb_build_object('pledge_id', v_id);
end;
$$;

revoke all on function public.settle_word_pledges(uuid) from public, anon;
revoke all on function public.create_word_pledge(uuid, text, numeric, timestamptz) from public, anon;
grant execute on function public.settle_word_pledges(uuid) to authenticated, service_role;
grant execute on function public.create_word_pledge(uuid, text, numeric, timestamptz) to authenticated;
