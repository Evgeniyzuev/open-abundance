-- Reserve guard (2026-11-11, after the reserve wallet was emptied on Nov 8 outside the app): the periodic treasury
-- check remembers the reserve balances and compares every drop with the withdrawal journal. A drop the journal does
-- not explain sends the operators a push and a Telegram message. It does not pause withdrawals: a transfer signed
-- outside the app cannot be stopped from inside it (founder, 2026-11-11).
begin;

alter table public.treasury_coverage_state
  add column if not exists last_ton_balance numeric,
  add column if not exists last_usdt_balance numeric,
  add column if not exists last_unexplained_at timestamptz;

commit;
