-- Core accrual obligations and the breach-only redemption path.
create table if not exists public.core_accrual_obligations (
  id uuid primary key default gen_random_uuid(),
  accrual_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  core_before numeric(30, 12) not null check (core_before >= 0),
  daily_rate numeric(12, 10) not null check (daily_rate >= 0),
  expected_gross_amount numeric(30, 12) not null check (expected_gross_amount >= 0),
  expected_core_amount numeric(30, 12) not null check (expected_core_amount >= 0),
  expected_wallet_amount numeric(30, 12) not null check (expected_wallet_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'settled', 'breached')),
  breach_reason text,
  settled_at timestamptz,
  breached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accrual_date, user_id)
);

alter table public.daily_core_accruals
  add column if not exists obligation_id uuid references public.core_accrual_obligations(id) on delete set null;

create table if not exists public.core_obligation_breaches (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null unique references public.core_accrual_obligations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  breach_reason text not null,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

insert into public.core_accrual_obligations (
  accrual_date,
  user_id,
  core_before,
  daily_rate,
  expected_gross_amount,
  expected_core_amount,
  expected_wallet_amount,
  status,
  settled_at
)
select
  accrual.accrual_date,
  accrual.user_id,
  accrual.core_before,
  accrual.daily_rate,
  accrual.gross_amount,
  accrual.core_amount,
  accrual.wallet_amount,
  'settled',
  accrual.created_at
from public.daily_core_accruals accrual
where not exists (
  select 1
  from public.core_accrual_obligations obligation
  where obligation.accrual_date = accrual.accrual_date
    and obligation.user_id = accrual.user_id
);

update public.daily_core_accruals accrual
set obligation_id = obligation.id
from public.core_accrual_obligations obligation
where obligation.accrual_date = accrual.accrual_date
  and obligation.user_id = accrual.user_id
  and accrual.obligation_id is null;

create index if not exists core_accrual_obligations_pending_idx
on public.core_accrual_obligations (status, accrual_date)
where status = 'pending';

create index if not exists core_accrual_obligations_user_idx
on public.core_accrual_obligations (user_id, accrual_date desc);

create table if not exists public.core_redemption_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  breach_obligation_id uuid not null references public.core_accrual_obligations(id),
  core_balance_before numeric(30, 12) not null check (core_balance_before > 0),
  amount numeric(30, 12) not null check (amount > 0),
  network text not null,
  payout_address text not null,
  status text not null default 'requested' check (status in ('eligible', 'requested', 'reserved', 'processing', 'paid', 'failed')),
  idempotency_key text,
  tx_hash text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  address_confirmed_at timestamptz,
  cooling_until timestamptz,
  reserved_at timestamptz,
  kyc_status text not null default 'pending' check (kyc_status in ('not_required', 'pending', 'passed', 'failed')),
  aml_status text not null default 'pending' check (aml_status in ('not_required', 'pending', 'passed', 'failed')),
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.core_redemption_requests
  add column if not exists core_balance_before numeric(30, 12),
  add column if not exists address_confirmed_at timestamptz,
  add column if not exists cooling_until timestamptz,
  add column if not exists reserved_at timestamptz,
  add column if not exists kyc_status text not null default 'pending',
  add column if not exists aml_status text not null default 'pending';

update public.core_redemption_requests
set core_balance_before = amount
where core_balance_before is null;

alter table public.core_redemption_requests
  alter column core_balance_before set not null;

create index if not exists core_redemption_requests_user_idx
on public.core_redemption_requests (user_id, requested_at desc);

create index if not exists core_redemption_requests_worker_idx
on public.core_redemption_requests (status, requested_at)
where status in ('requested', 'failed');

create unique index if not exists core_redemption_active_user_idx
on public.core_redemption_requests (user_id)
where status in ('requested', 'reserved', 'processing', 'paid', 'failed');

create table if not exists public.core_redemption_controls (
  id boolean primary key default true check (id),
  redemption_enabled boolean not null default true,
  system_emissions_paused boolean not null default false,
  user_facing_enabled boolean not null default false,
  worker_paused boolean not null default false,
  supported_network text not null default 'polygon',
  cooling_period_hours integer not null default 24 check (cooling_period_hours between 0 and 720),
  max_request_amount numeric(30, 12),
  daily_payout_limit numeric(30, 12),
  kyc_required boolean not null default false,
  aml_required boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.core_redemption_controls (id)
values (true)
on conflict (id) do nothing;

alter table public.core_redemption_controls
  add column if not exists system_emissions_paused boolean not null default false;

create table if not exists public.core_treasury_reserve_snapshots (
  id uuid primary key default gen_random_uuid(),
  reserve_amount numeric(30, 12) not null check (reserve_amount >= 0),
  currency_code text not null default 'USD',
  source text not null default 'operator',
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.core_accrual_obligations enable row level security;
alter table public.core_obligation_breaches enable row level security;
alter table public.core_redemption_requests enable row level security;
alter table public.core_redemption_controls enable row level security;
alter table public.core_treasury_reserve_snapshots enable row level security;

drop policy if exists "Users can read own core accrual obligations" on public.core_accrual_obligations;
create policy "Users can read own core accrual obligations"
on public.core_accrual_obligations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own core obligation breaches" on public.core_obligation_breaches;
create policy "Users can read own core obligation breaches"
on public.core_obligation_breaches
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own core redemption requests" on public.core_redemption_requests;
create policy "Users can read own core redemption requests"
on public.core_redemption_requests
for select
using (auth.uid() = user_id);

revoke all on public.core_redemption_controls from public, anon, authenticated;
grant select, insert, update, delete on public.core_redemption_controls to service_role;

revoke all on public.core_treasury_reserve_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.core_treasury_reserve_snapshots to service_role;

create or replace view public.core_redemption_liability as
select coalesce(sum(balance), 0)::numeric(30, 12) as total_core_balance
from public.core_accounts;

create or replace view public.core_obligation_breach as
select id, obligation_id, user_id, breach_reason, detected_at, metadata
from public.core_obligation_breaches;

create or replace view public.core_redemption_coverage as
select
  liability.total_core_balance,
  reserve.reserve_amount,
  case
    when liability.total_core_balance = 0 then null
    else reserve.reserve_amount / liability.total_core_balance
  end as coverage_ratio,
  reserve.captured_at
from public.core_redemption_liability liability
left join lateral (
  select reserve_amount, captured_at
  from public.core_treasury_reserve_snapshots
  order by captured_at desc
  limit 1
) reserve on true;

create or replace view public.treasury_liability_coverage as
select
  wallet_liability.withdrawable_wallet_liability,
  core_liability.total_core_balance as core_redemption_liability,
  (wallet_liability.withdrawable_wallet_liability + core_liability.total_core_balance)::numeric(30, 12) as total_liability,
  reserve.reserve_amount,
  case
    when wallet_liability.withdrawable_wallet_liability + core_liability.total_core_balance = 0 then null
    else reserve.reserve_amount / (wallet_liability.withdrawable_wallet_liability + core_liability.total_core_balance)
  end as coverage_ratio,
  reserve.captured_at
from (
  select coalesce(sum(balance), 0)::numeric(30, 12) as withdrawable_wallet_liability
  from public.wallet_accounts
) wallet_liability
cross join public.core_redemption_liability core_liability
left join lateral (
  select reserve_amount, captured_at
  from public.core_treasury_reserve_snapshots
  order by captured_at desc
  limit 1
) reserve on true;

revoke all on public.core_redemption_liability, public.core_redemption_coverage, public.treasury_liability_coverage from public, anon, authenticated;
grant select on public.core_redemption_liability, public.core_redemption_coverage, public.treasury_liability_coverage to service_role;
revoke all on public.core_obligation_breach from public, anon, authenticated;
grant select on public.core_obligation_breach to service_role;

create or replace function public.refresh_core_emission_safety()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reserve_amount numeric(30, 12);
  total_liability numeric(30, 12);
  paused boolean;
begin
  select coverage.reserve_amount, coverage.total_liability
  into reserve_amount, total_liability
  from public.treasury_liability_coverage coverage;

  paused := reserve_amount is not null and reserve_amount < total_liability;
  update public.core_redemption_controls
  set system_emissions_paused = paused,
      updated_at = now()
  where id = true;
  return paused;
end;
$$;

create or replace function public.detect_core_obligation_breaches(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.core_accrual_obligations
  set status = 'breached',
      breach_reason = 'No settled daily accrual within the 24-hour grace window.',
      breached_at = coalesce(breached_at, p_now),
      updated_at = p_now
  where status = 'pending'
    and accrual_date < ((p_now at time zone 'utc')::date - 1);

  update public.core_accrual_obligations obligation
  set status = 'breached',
      breach_reason = 'Settled accrual amounts do not match the recorded obligation.',
      breached_at = coalesce(breached_at, p_now),
      updated_at = p_now
  where obligation.status = 'settled'
    and obligation.accrual_date < ((p_now at time zone 'utc')::date - 1)
    and (
      not exists (
        select 1
        from public.daily_core_accruals accrual
        where accrual.obligation_id = obligation.id
      )
      or exists (
        select 1
        from public.daily_core_accruals accrual
        where accrual.obligation_id = obligation.id
          and (
            abs(accrual.gross_amount - obligation.expected_gross_amount) > 0.00000001
            or abs(accrual.core_amount - obligation.expected_core_amount) > 0.00000001
            or abs(accrual.wallet_amount - obligation.expected_wallet_amount) > 0.00000001
          )
      )
    );

  insert into public.core_obligation_breaches (obligation_id, user_id, breach_reason, detected_at)
  select obligation.id, obligation.user_id, obligation.breach_reason, p_now
  from public.core_accrual_obligations obligation
  where obligation.status = 'breached'
    and obligation.breached_at = p_now
  on conflict (obligation_id) do nothing;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.guard_core_balance_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  redemption_override text := coalesce(current_setting('open_abundance.allow_core_redemption', true), 'off');
begin
  if new.balance < old.balance and redemption_override <> 'on' then
    raise exception 'Core balance cannot decrease outside the breach redemption RPC.' using errcode = '42501';
  end if;

  if new.balance > old.balance
    and redemption_override <> 'on'
    and exists (
      select 1
      from public.core_redemption_requests request
      where request.user_id = new.user_id
        and request.status in ('requested', 'reserved', 'processing', 'paid', 'failed')
    ) then
    raise exception 'Core redemption is pending for this account.' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_guard_core_balance_integrity on public.core_accounts;
create trigger trigger_guard_core_balance_integrity
before update of balance on public.core_accounts
for each row
execute function public.guard_core_balance_integrity();

create or replace function public.run_daily_core_accrual(
  p_accrual_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account record;
  daily_rate constant numeric(12, 10) := 0.0006330000;
  gross_amount numeric(30, 12);
  core_amount numeric(30, 12);
  wallet_amount numeric(30, 12);
  obligation_id uuid;
  inserted boolean;
begin
  perform public.refresh_core_emission_safety();

  if exists (
    select 1
    from public.core_redemption_controls
    where id = true and system_emissions_paused
  ) then
    return;
  end if;

  for account in
    select core.user_id, core.balance, core.reinvest_percent
    from public.core_accounts core
    where not exists (
      select 1
      from public.core_redemption_requests request
      where request.user_id = core.user_id
        and request.status in ('requested', 'reserved', 'processing', 'paid', 'failed')
    )
    order by core.user_id
  loop
    gross_amount := round(account.balance * daily_rate, 12);
    core_amount := round(gross_amount * (account.reinvest_percent / 100), 12);
    wallet_amount := gross_amount - core_amount;

    insert into public.core_accrual_obligations (
      accrual_date,
      user_id,
      core_before,
      daily_rate,
      expected_gross_amount,
      expected_core_amount,
      expected_wallet_amount
    )
    values (
      p_accrual_date,
      account.user_id,
      account.balance,
      daily_rate,
      gross_amount,
      core_amount,
      wallet_amount
    )
    on conflict (accrual_date, user_id) do nothing;

    select id into obligation_id
    from public.core_accrual_obligations
    where accrual_date = p_accrual_date
      and user_id = account.user_id;

    inserted := false;
    insert into public.daily_core_accruals (
      accrual_date,
      user_id,
      core_before,
      daily_rate,
      gross_amount,
      reinvest_percent,
      core_amount,
      wallet_amount,
      core_after,
      obligation_id
    )
    values (
      p_accrual_date,
      account.user_id,
      account.balance,
      daily_rate,
      gross_amount,
      account.reinvest_percent,
      core_amount,
      wallet_amount,
      account.balance + core_amount,
      obligation_id
    )
    on conflict (accrual_date, user_id) do nothing
    returning true into inserted;

    if exists (select 1 from public.daily_core_accruals where accrual_date = p_accrual_date and user_id = account.user_id) then
      update public.core_accrual_obligations
      set status = case when status = 'breached' then status else 'settled' end,
          settled_at = coalesce(settled_at, now()),
          updated_at = now()
      where id = obligation_id;
    end if;

    if coalesce(inserted, false) then
      if core_amount > 0 then
        update public.core_accounts
        set balance = balance + core_amount,
            updated_at = now()
        where user_id = account.user_id;
      end if;

      if wallet_amount > 0 then
        update public.wallet_accounts
        set balance = balance + wallet_amount,
            updated_at = now()
        where user_id = account.user_id;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.redeem_core_after_breach(
  p_user_id uuid,
  p_network text,
  p_payout_address text,
  p_idempotency_key text default null
)
returns setof public.core_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_request public.core_redemption_requests%rowtype;
  breach public.core_accrual_obligations%rowtype;
  account public.core_accounts%rowtype;
  controls public.core_redemption_controls%rowtype;
  normalized_idempotency_key text;
begin
  if p_user_id is null or nullif(trim(p_network), '') is null or nullif(trim(p_payout_address), '') is null then
    raise exception 'User, network and payout address are required.';
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Users can only redeem their own Core.' using errcode = '42501';
  end if;

  normalized_idempotency_key := coalesce(nullif(trim(p_idempotency_key), ''), gen_random_uuid()::text);

  perform public.detect_core_obligation_breaches(now());

  select * into existing_request
  from public.core_redemption_requests
  where user_id = p_user_id and idempotency_key = normalized_idempotency_key
  limit 1;
  if existing_request.id is not null then
    return next existing_request;
    return;
  end if;

  select * into controls
  from public.core_redemption_controls
  where id = true
  for share;
  if controls.id is distinct from true or not controls.redemption_enabled then
    raise exception 'Core redemption is temporarily disabled.' using errcode = '55000';
  end if;
  if lower(trim(p_network)) <> lower(trim(controls.supported_network)) then
    raise exception 'Only the configured redemption network is supported.' using errcode = '22023';
  end if;

  select * into existing_request
  from public.core_redemption_requests
  where user_id = p_user_id
    and status in ('requested', 'reserved', 'processing', 'paid', 'failed')
  order by requested_at desc
  limit 1
  for update;
  if existing_request.id is not null then
    return next existing_request;
    return;
  end if;

  select * into breach
  from public.core_accrual_obligations
  where user_id = p_user_id
    and status = 'breached'
  order by breached_at asc
  limit 1
  for update;

  if breach.id is null then
    raise exception 'No eligible Core accrual breach was found.' using errcode = '42501';
  end if;

  select * into account
  from public.core_accounts
  where user_id = p_user_id
  for update;

  if account.user_id is null or account.balance <= 0 then
    raise exception 'There is no positive Core balance to redeem.';
  end if;

  if controls.max_request_amount is not null and account.balance > controls.max_request_amount then
    raise exception 'The Core balance exceeds the current redemption limit.' using errcode = '22003';
  end if;

  insert into public.core_redemption_requests (
    user_id,
    breach_obligation_id,
    core_balance_before,
    amount,
    network,
    payout_address,
    status,
    idempotency_key,
    address_confirmed_at,
    cooling_until,
    updated_at
  )
  values (
    p_user_id,
    breach.id,
    account.balance,
    account.balance,
    lower(trim(p_network)),
    trim(p_payout_address),
    'requested',
    normalized_idempotency_key,
    now(),
    now() + make_interval(hours => controls.cooling_period_hours),
    now()
  )
  returning * into existing_request;

  return next existing_request;
end;
$$;

create or replace function public.claim_core_redemption_request(
  p_request_id uuid
)
returns setof public.core_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.core_redemption_requests%rowtype;
  controls public.core_redemption_controls%rowtype;
begin
  select * into request from public.core_redemption_requests where id = p_request_id for update;
  if request.id is null then raise exception 'Redemption request not found.'; end if;
  if request.status = 'paid' then return next request; return; end if;
  if request.status not in ('requested', 'reserved', 'failed') then raise exception 'Redemption request is not claimable in status %.', request.status; end if;

  select * into controls from public.core_redemption_controls where id = true;
  if controls.worker_paused then
    raise exception 'Core redemption worker is paused.' using errcode = '55000';
  end if;
  if request.cooling_until is not null and request.cooling_until > now() then
    raise exception 'The payout address cooling period has not finished.' using errcode = '55000';
  end if;
  if controls.kyc_required and request.kyc_status <> 'passed' then
    raise exception 'KYC approval is required before payout.' using errcode = '42501';
  end if;
  if controls.aml_required and request.aml_status <> 'passed' then
    raise exception 'AML approval is required before payout.' using errcode = '42501';
  end if;
  if controls.daily_payout_limit is not null
    and coalesce((
      select sum(amount)
      from public.core_redemption_requests paid_request
      where paid_request.status = 'paid'
        and paid_request.paid_at >= ((now() at time zone 'utc')::date at time zone 'utc')
        and paid_request.paid_at < (((now() at time zone 'utc')::date + 1) at time zone 'utc')
    ), 0) + request.amount > controls.daily_payout_limit then
    raise exception 'The daily Core payout limit has been reached.' using errcode = '22003';
  end if;

  if request.status in ('requested', 'failed') then
    update public.core_redemption_requests
    set status = 'reserved',
        reserved_at = coalesce(reserved_at, now()),
        updated_at = now()
    where id = request.id
    returning * into request;
  end if;

  update public.core_redemption_requests
  set status = 'processing',
      attempt_count = attempt_count + 1,
      reserved_at = coalesce(reserved_at, now()),
      processing_at = now(),
      updated_at = now()
  where id = request.id
  returning * into request;
  return next request;
end;
$$;

create or replace function public.complete_core_redemption_request(
  p_request_id uuid,
  p_tx_hash text
)
returns setof public.core_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.core_redemption_requests%rowtype;
  balance_before numeric(30, 12);
begin
  select * into request from public.core_redemption_requests where id = p_request_id for update;
  if request.id is null then raise exception 'Redemption request not found.'; end if;
  if request.status = 'paid' then return next request; return; end if;
  if request.status <> 'processing' then raise exception 'Redemption request is not processing.'; end if;

  select balance into balance_before from public.core_accounts where user_id = request.user_id for update;
  if balance_before < request.amount then raise exception 'Core balance is below the reserved redemption amount.'; end if;

  perform set_config('open_abundance.allow_core_redemption', 'on', true);
  update public.core_accounts
  set balance = balance - request.amount,
      updated_at = now()
  where user_id = request.user_id;

  update public.core_redemption_requests
  set status = 'paid',
      tx_hash = nullif(trim(p_tx_hash), ''),
      paid_at = now(),
      updated_at = now()
  where id = request.id
  returning * into request;
  return next request;
end;
$$;

create or replace function public.fail_core_redemption_request(
  p_request_id uuid,
  p_error text
)
returns setof public.core_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.core_redemption_requests%rowtype;
begin
  update public.core_redemption_requests
  set status = 'failed',
      last_error = left(nullif(trim(p_error), ''), 500),
      updated_at = now()
  where id = p_request_id
    and status = 'processing'
  returning * into request;
  if request.id is null then raise exception 'Processing redemption request not found.'; end if;
  return next request;
end;
$$;

revoke all on function public.detect_core_obligation_breaches(timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_core_emission_safety() from public, anon, authenticated;
grant execute on function public.refresh_core_emission_safety() to service_role;
revoke all on function public.redeem_core_after_breach(uuid, text, text, text) from public, anon;
grant execute on function public.redeem_core_after_breach(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.claim_core_redemption_request(uuid) from public, anon, authenticated;
revoke all on function public.complete_core_redemption_request(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_core_redemption_request(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_core_redemption_request(uuid) to service_role;
grant execute on function public.complete_core_redemption_request(uuid, text) to service_role;
grant execute on function public.fail_core_redemption_request(uuid, text) to service_role;

grant select on public.core_accrual_obligations, public.core_obligation_breaches, public.core_redemption_requests to authenticated;
grant select, insert, update, delete on public.core_accrual_obligations, public.core_obligation_breaches, public.core_redemption_requests to service_role;
