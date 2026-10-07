-- Pilot safety for crypto withdrawals:
-- 1) rolling 24-hour limits per user and for the whole platform, enforced atomically
--    by a BEFORE INSERT trigger on both withdrawal tables;
-- 2) a service-role-only summary of Wallet obligations for the operator coverage report.
-- Limits are expressed in Wallet dollars (payout amount, without fees) and can be changed
-- with a single UPDATE of the one configuration row.

create table if not exists public.crypto_withdrawal_limits (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  per_user_daily_amount numeric(30, 12) not null default 100 check (per_user_daily_amount >= 0),
  global_daily_amount numeric(30, 12) not null default 500 check (global_daily_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.crypto_withdrawal_limits (id) values (true) on conflict (id) do nothing;

alter table public.crypto_withdrawal_limits enable row level security;
revoke all on public.crypto_withdrawal_limits from public, anon, authenticated;
grant select, insert, update on public.crypto_withdrawal_limits to service_role;

create or replace function public.enforce_crypto_withdrawal_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.crypto_withdrawal_limits%rowtype;
  user_total numeric(30, 12);
  global_total numeric(30, 12);
begin
  select * into cfg from public.crypto_withdrawal_limits where id = true;
  if not found or not cfg.enabled then
    return new;
  end if;

  -- Serialise limit checks so concurrent requests cannot jointly exceed the global limit.
  perform pg_advisory_xact_lock(hashtext('crypto_withdrawal_limits'));

  select
    coalesce(sum(amount) filter (where user_id = new.user_id), 0),
    coalesce(sum(amount), 0)
  into user_total, global_total
  from (
    select user_id, payout_wallet_amount as amount
    from public.ton_withdrawals
    where created_at > now() - interval '24 hours' and status not in ('failed', 'refunded')
    union all
    select user_id, payout_wallet_amount as amount
    from public.ton_usdt_withdrawals
    where created_at > now() - interval '24 hours' and status not in ('failed', 'refunded')
  ) recent;

  if user_total + new.payout_wallet_amount > cfg.per_user_daily_amount then
    raise exception 'Daily withdrawal limit reached for your account. Try again later.';
  end if;
  if global_total + new.payout_wallet_amount > cfg.global_daily_amount then
    raise exception 'Daily withdrawal limit reached for the platform. Try again later.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_ton_withdrawal_limits on public.ton_withdrawals;
create trigger enforce_ton_withdrawal_limits
before insert on public.ton_withdrawals
for each row execute function public.enforce_crypto_withdrawal_limits();

drop trigger if exists enforce_ton_usdt_withdrawal_limits on public.ton_usdt_withdrawals;
create trigger enforce_ton_usdt_withdrawal_limits
before insert on public.ton_usdt_withdrawals
for each row execute function public.enforce_crypto_withdrawal_limits();

revoke all on function public.enforce_crypto_withdrawal_limits() from public, anon, authenticated;

create or replace function public.treasury_liability_summary()
returns table (
  wallet_accounts_count bigint,
  wallet_balance_total numeric,
  withdrawals_in_flight_total numeric,
  withdrawals_manual_review_count bigint,
  withdrawals_manual_review_total numeric,
  deposits_credited_total numeric,
  withdrawals_confirmed_total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with all_withdrawals as (
    select status, total_reserved_amount, payout_wallet_amount from public.ton_withdrawals
    union all
    select status, total_reserved_amount, payout_wallet_amount from public.ton_usdt_withdrawals
  )
  select
    (select count(*) from public.wallet_accounts),
    (select coalesce(sum(balance), 0) from public.wallet_accounts),
    (select coalesce(sum(total_reserved_amount), 0) from all_withdrawals where status in ('funds_reserved', 'broadcasting')),
    (select count(*) from all_withdrawals where status = 'manual_review'),
    (select coalesce(sum(total_reserved_amount), 0) from all_withdrawals where status = 'manual_review'),
    (select coalesce(sum(amount), 0) from public.wallet_ledger where operation_type = 'crypto_deposit' and direction = 'credit'),
    (select coalesce(sum(payout_wallet_amount), 0) from all_withdrawals where status in ('broadcast', 'confirmed'));
$$;

revoke all on function public.treasury_liability_summary() from public, anon, authenticated;
grant execute on function public.treasury_liability_summary() to service_role;
