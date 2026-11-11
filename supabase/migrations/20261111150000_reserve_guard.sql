-- Reserve guard (2026-11-11, after the reserve wallet was emptied on Nov 8 outside the app): the periodic treasury
-- check remembers the reserve balances and compares every drop with the withdrawal journal. A drop the journal does
-- not explain alerts the operators and pauses app withdrawals until an operator resumes them.
begin;

alter table public.treasury_coverage_state
  add column if not exists last_ton_balance numeric,
  add column if not exists last_usdt_balance numeric,
  add column if not exists withdrawals_paused boolean not null default false,
  add column if not exists paused_reason text,
  add column if not exists paused_at timestamptz,
  add column if not exists last_unexplained_at timestamptz;

commit;
