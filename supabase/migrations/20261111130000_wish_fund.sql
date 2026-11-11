-- Founder decision 2026-11-10 («Желания недели»): an open fund that fulfils participants' wishes every week.
-- One ledger: money that came in (founder, patrons) and what was fulfilled (help from people, a habit with Nova,
-- a small sum). The public page /fund shows totals for every row and details only for rows marked public, which
-- needs the person's consent. Rows are written by the operator or Claude through the internal API (service role).
begin;

create table if not exists public.wish_fund_entries (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  kind text not null check (kind in ('founder', 'patron', 'help', 'habit', 'money')),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  week_start date not null,
  user_id uuid references auth.users (id) on delete set null,
  wish_id uuid references public.wishes (id) on delete set null,
  title text not null default '' check (char_length(title) <= 160),
  person_did text not null default '' check (char_length(person_did) <= 400),
  result text not null default '' check (char_length(result) <= 600),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  check ((direction = 'in' and kind in ('founder', 'patron')) or (direction = 'out' and kind in ('help', 'habit', 'money')))
);
create index if not exists wish_fund_entries_week on public.wish_fund_entries (week_start desc, created_at desc);

-- No policies: only the service role reads and writes; the public page is rendered on the server.
alter table public.wish_fund_entries enable row level security;

commit;
