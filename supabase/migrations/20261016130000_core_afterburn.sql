-- Afterburn: when a person turns it on, every night before the Core accrual their free Wallet balance
-- above a kept amount moves into Core, so the moved money earns the accrual the same night.
--
-- Wallet balance is already the free balance: Market escrow, P2P collateral and sell ads, and crypto
-- withdrawals are debited from it when they are reserved, so nothing reserved can be moved.
-- The move goes through the existing wallet_core_topup (same locks, checks, ledger row and Core
-- redemption guard) with the idempotency key afterburn:{date}:{user}, so a rerun of the night job
-- moves nothing twice. One person's failure is recorded and does not stop the others.
-- The night job runs Afterburn strictly before run_daily_core_accrual inside one transaction.

create table if not exists public.core_afterburn_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  keep_amount numeric(30, 12) not null default 0 check (keep_amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.core_afterburn_settings enable row level security;
revoke all on public.core_afterburn_settings from public, anon, authenticated;
grant select on public.core_afterburn_settings to authenticated;
grant select, insert, update, delete on public.core_afterburn_settings to service_role;

drop policy if exists "Users can read own afterburn settings" on public.core_afterburn_settings;
create policy "Users can read own afterburn settings"
on public.core_afterburn_settings
for select
using (auth.uid() = user_id);

create table if not exists public.core_afterburn_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('moved', 'failed')),
  amount numeric(30, 12) not null default 0 check (amount >= 0),
  wallet_ledger_id uuid,
  error text,
  created_at timestamptz not null default now(),
  unique (run_date, user_id)
);

create index if not exists core_afterburn_runs_user_idx on public.core_afterburn_runs (user_id, run_date desc);

alter table public.core_afterburn_runs enable row level security;
revoke all on public.core_afterburn_runs from public, anon, authenticated;
grant select on public.core_afterburn_runs to authenticated;
grant select, insert, update on public.core_afterburn_runs to service_role;

drop policy if exists "Users can read own afterburn runs" on public.core_afterburn_runs;
create policy "Users can read own afterburn runs"
on public.core_afterburn_runs
for select
using (auth.uid() = user_id);

create or replace function public.run_daily_afterburn(
  p_run_date date default ((now() at time zone 'utc')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  setting record;
  free_amount numeric(30, 12);
  ledger_id uuid;
  moved_count integer := 0;
  min_amount constant numeric := 0.01;
begin
  perform public.refresh_core_emission_safety();
  -- Without the accrual tonight the move would only lock money in Core, so Afterburn waits too.
  if exists (select 1 from public.core_redemption_controls where id = true and system_emissions_paused) then
    return 0;
  end if;

  for setting in
    select s.user_id, s.keep_amount, w.balance
    from public.core_afterburn_settings s
    join public.wallet_accounts w on w.user_id = s.user_id
    join public.core_accounts c on c.user_id = s.user_id
    where s.enabled
      and w.balance - s.keep_amount >= min_amount
      -- The accrual skips a pending Core redemption, so Afterburn does too.
      and not exists (
        select 1 from public.core_redemption_requests request
        where request.user_id = s.user_id and request.status in ('requested', 'reserved', 'processing', 'paid', 'failed')
      )
      -- A P2P debtor keeps Wallet money for the recovery.
      and not exists (
        select 1 from public.p2p_recovery_claims claim
        where claim.debtor_user_id = s.user_id and claim.status = 'active'
      )
      and not exists (
        select 1 from public.core_afterburn_runs run
        where run.run_date = p_run_date and run.user_id = s.user_id
      )
    order by s.user_id
  loop
    begin
      -- Re-read under the wallet_core_topup lock is not possible from here, so the amount is rounded
      -- down to cents and wallet_core_topup still refuses anything above the live balance.
      free_amount := floor((setting.balance - setting.keep_amount) * 100) / 100;
      if free_amount < min_amount then
        continue;
      end if;

      select topup.wallet_ledger_id into ledger_id
      from public.wallet_core_topup(
        setting.user_id,
        free_amount,
        gen_random_uuid(),
        'afterburn:' || p_run_date::text || ':' || setting.user_id::text
      ) as topup;

      update public.wallet_ledger
      set metadata = metadata || jsonb_build_object('afterburn', true, 'run_date', p_run_date)
      where id = ledger_id;

      insert into public.core_afterburn_runs (run_date, user_id, status, amount, wallet_ledger_id)
      values (p_run_date, setting.user_id, 'moved', free_amount, ledger_id);
      moved_count := moved_count + 1;
    exception when others then
      insert into public.core_afterburn_runs (run_date, user_id, status, amount, error)
      values (p_run_date, setting.user_id, 'failed', 0, left(sqlerrm, 500))
      on conflict (run_date, user_id) do nothing;
    end;
  end loop;

  return moved_count;
end;
$$;

revoke all on function public.run_daily_afterburn(date) from public, anon, authenticated;
grant execute on function public.run_daily_afterburn(date) to service_role;

-- The night job: Afterburn first, then the accrual reads the new Core balances, then the team bonus.
create or replace function public.run_daily_core_and_team_bonus(
  p_run_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('open_abundance_daily_core_and_team_bonus')) then
    return;
  end if;

  perform public.run_daily_afterburn(p_run_date);
  perform public.run_daily_core_accrual(p_run_date);
  perform public.run_daily_team_bonus(p_run_date);
end;
$$;

revoke all on function public.run_daily_core_and_team_bonus(date) from public, anon, authenticated;

-- Challenge: one Afterburn move of more than $5 into Core.
insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values (
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e15',
  '{"ru":"Afterburn","en":"Afterburn"}'::jsonb,
  '{"ru":"Включите Afterburn: ночью перед начислением свободный остаток Wallet сам переходит в Core и сразу приносит доход.","en":"Turn on Afterburn: every night before the accrual your free Wallet balance moves into Core and earns at once."}'::jsonb,
  '{"ru":"1. Откройте Кошелёк → Core и включите Afterburn.\n2. Оставьте в Wallet больше 5 $ сверх неснижаемого остатка.\n3. После ночного переноса нажмите «Проверить выполнение».","en":"1. Open Wallet → Core and turn on Afterburn.\n2. Keep more than $5 in Wallet above the kept amount.\n3. After the night move press Check completion."}'::jsonb,
  '{"ru":"Afterburn за один перенос перевёл в Core больше 5 $.","en":"Afterburn moved more than $5 into Core in one night."}'::jsonb,
  'finance', 2, 7, 'auto', 'afterburn_over_5',
  82, 'wallet.core', 1, 0, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    duration_days = excluded.duration_days,
    verification_type = excluded.verification_type,
    verification_logic = excluded.verification_logic,
    sort_order = excluded.sort_order,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount;
