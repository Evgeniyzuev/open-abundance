-- Internal turnover fee (founder decision 2026-10-13, docs/GROWTH_REALITY_PLAN.md section 3.3).
-- Money received from other participants (Marketplace payment to the seller, Wallet -> Wallet transfers and
-- paid payment requests) is free up to the configured amount over a rolling window per recipient; above it the
-- recipient pays the configured percent of the excess.
--
-- The credit row keeps the full (gross) amount. When a fee is due, a separate debit row
-- 'internal_turnover_fee' is written for the same source in the same transaction and the recipient's balance is
-- reduced by it. This covers every path that credits these operations without rewriting the settlement RPCs.
-- Deposits, Core payouts, rewards, refunds and P2P Wallet <-> RUB are not taxed and do not count toward the limit.
-- The callers already lock the recipient Wallet row, so concurrent credits are serialized.

create table if not exists public.internal_turnover_fee_configs (
  version text primary key,
  free_limit numeric(30, 12) not null check (free_limit >= 0),
  window_days integer not null check (window_days between 1 and 366),
  fee_percent numeric(8, 4) not null check (fee_percent >= 0 and fee_percent <= 100),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists internal_turnover_fee_configs_one_active_idx
  on public.internal_turnover_fee_configs (is_active) where is_active;

alter table public.internal_turnover_fee_configs enable row level security;
revoke all on table public.internal_turnover_fee_configs from anon, authenticated;

insert into public.internal_turnover_fee_configs (version, free_limit, window_days, fee_percent, is_active)
values ('internal-fee-v1', 10000, 30, 1, true)
on conflict (version) do nothing;

-- Allow the new ledger operation type without rewriting the whole list by hand.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'wallet_ledger_operation_type_check'
    and conrelid = 'public.wallet_ledger'::regclass;

  if def is not null and position('internal_turnover_fee' in def) = 0 then
    alter table public.wallet_ledger drop constraint wallet_ledger_operation_type_check;
    execute 'alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check '
      || replace(def, '''system_adjustment''::text', '''system_adjustment''::text, ''internal_turnover_fee''::text');
  end if;

  -- Without the new type every taxed credit would fail; stop the migration instead.
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'wallet_ledger_operation_type_check'
    and conrelid = 'public.wallet_ledger'::regclass;
  if def is null or position('internal_turnover_fee' in def) = 0 then
    raise exception 'wallet_ledger_operation_type_check does not allow internal_turnover_fee';
  end if;
end;
$$;

-- Fee for a new taxable credit, given what the recipient already received in the window (excluding this row).
create or replace function public.internal_turnover_fee_for(
  p_user_id uuid,
  p_amount numeric,
  p_exclude_ledger_id uuid default null
) returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with config as (
    select free_limit, window_days, fee_percent
    from public.internal_turnover_fee_configs
    where is_active
    limit 1
  ),
  used as (
    select coalesce(sum(l.amount), 0) as amount
    from public.wallet_ledger l, config c
    where l.user_id = p_user_id
      and l.direction = 'credit'
      and l.operation_type in ('wallet_transfer', 'marketplace_payment')
      and l.source_type in ('wallet_transfer', 'marketplace_deal')
      and l.counterparty_user_id is not null
      and l.counterparty_user_id <> p_user_id
      and l.created_at >= now() - make_interval(days => c.window_days)
      and (p_exclude_ledger_id is null or l.id <> p_exclude_ledger_id)
  )
  select coalesce(
    round(greatest(0, p_amount - greatest(0, c.free_limit - u.amount)) * c.fee_percent / 100, 2),
    0
  )
  from config c, used u;
$$;

revoke all on function public.internal_turnover_fee_for(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.internal_turnover_fee_for(uuid, numeric, uuid) to service_role;

create or replace function public.apply_internal_turnover_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee numeric;
  v_config public.internal_turnover_fee_configs%rowtype;
  v_balance numeric(30, 12);
begin
  v_fee := public.internal_turnover_fee_for(new.user_id, new.amount, new.id);
  if v_fee is null or v_fee <= 0 then return new; end if;
  select * into v_config from public.internal_turnover_fee_configs where is_active limit 1;

  update public.wallet_accounts
    set balance = balance - v_fee, updated_at = now()
    where user_id = new.user_id
    returning balance into v_balance;
  if not found then return new; end if;

  insert into public.wallet_ledger (
    user_id, direction, amount, currency_code, operation_type, source_type, source_id,
    counterparty_user_id, balance_after, idempotency_key, metadata
  ) values (
    new.user_id, 'debit', v_fee, new.currency_code, 'internal_turnover_fee', new.source_type, new.source_id,
    null, v_balance, coalesce(new.idempotency_key, new.id::text) || ':fee',
    jsonb_build_object(
      'credit_ledger_id', new.id,
      'gross_amount', new.amount,
      'fee_percent', v_config.fee_percent,
      'free_limit', v_config.free_limit,
      'window_days', v_config.window_days,
      'config_version', v_config.version
    )
  );
  return new;
end;
$$;

revoke all on function public.apply_internal_turnover_fee() from public, anon, authenticated;

drop trigger if exists apply_internal_turnover_fee on public.wallet_ledger;
create trigger apply_internal_turnover_fee
  after insert on public.wallet_ledger
  for each row
  when (
    new.direction = 'credit'
    and new.operation_type in ('wallet_transfer', 'marketplace_payment')
    and new.source_type in ('wallet_transfer', 'marketplace_deal')
    and new.counterparty_user_id is not null
    and new.counterparty_user_id <> new.user_id
  )
  execute function public.apply_internal_turnover_fee();

-- The credit already notifies the recipient; the fee row does not need a second notification.
create or replace function public.notify_wallet_ledger_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.operation_type = 'internal_turnover_fee' then return new; end if;
  perform public.create_notification_event(
    'wallet.' || new.operation_type,
    'wallet',
    new.source_type,
    coalesce(new.source_id::text, new.id::text),
    'Wallet updated',
    'A Wallet operation was recorded.',
    '/?view=wallet.wallet',
    array[new.user_id],
    'wallet-ledger:' || new.id,
    jsonb_build_object('direction', new.direction, 'operationType', new.operation_type)
  );
  return new;
end;
$$;
