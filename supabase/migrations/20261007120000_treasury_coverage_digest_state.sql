-- Remember when the daily treasury status digest was last sent.
alter table public.treasury_coverage_state
  add column if not exists last_digest_at timestamptz;
