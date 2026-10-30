-- Founder decision 2026-10-30 (Duolingo-style «bonus for tomorrow»): after the first two tasks a person gets a closed
-- chest. A key comes once a day when the Core earned by actions that day (UTC) reaches $5; the key opens one chest
-- whose day has come. At $8 earned in a day a new closed chest appears for tomorrow. Chests never expire.
-- The chest holds a Core bonus with open odds (chest_settings.odds); the person opens it with a tap.
begin;

create table if not exists public.chest_settings (
  id boolean primary key default true check (id),
  first_chest_after_tasks int not null default 2,
  key_core_amount numeric(30, 12) not null default 5,
  next_chest_core_amount numeric(30, 12) not null default 8,
  -- [{"amount": 0.3, "weight": 60}, ...]: the chance of each amount is its weight over the sum of weights.
  odds jsonb not null default '[{"amount": 0.3, "weight": 60}, {"amount": 0.5, "weight": 30}, {"amount": 1, "weight": 9}, {"amount": 5, "weight": 1}]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.chest_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.daily_chests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'first': after the first tasks; 'tomorrow': earned with next_chest_core_amount on earned_on.
  kind text not null check (kind in ('first', 'tomorrow')),
  earned_on date not null,
  opens_on date not null,
  status text not null default 'locked' check (status in ('locked', 'opened')),
  reward_core_amount numeric(30, 12),
  opened_on date,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists daily_chests_one_first on public.daily_chests (user_id) where kind = 'first';
create unique index if not exists daily_chests_one_per_day on public.daily_chests (user_id, earned_on) where kind = 'tomorrow';
-- One key a day: at most one chest opened per person per day.
create unique index if not exists daily_chests_one_open_per_day on public.daily_chests (user_id, opened_on) where opened_on is not null;
create index if not exists daily_chests_user on public.daily_chests (user_id, created_at desc);

alter table public.chest_settings enable row level security;
alter table public.daily_chests enable row level security;
drop policy if exists "daily chests are readable by owner" on public.daily_chests;
create policy "daily chests are readable by owner" on public.daily_chests for select using (auth.uid() = user_id);

-- Opens one chest. p_earned_today is the Core earned by actions today, counted by the API from the same sources as
-- Core «Состав» (chest rewards themselves are not counted). Only the service role calls it.
create or replace function public.open_daily_chest(p_user_id uuid, p_chest_id uuid, p_earned_today numeric)
returns table (chest_id uuid, reward_core_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.chest_settings%rowtype;
  chest public.daily_chests%rowtype;
  today date := (now() at time zone 'utc')::date;
  total_weight numeric := 0;
  roll numeric;
  item jsonb;
  reward numeric(30, 12) := 0;
begin
  select * into settings from public.chest_settings where id = true;
  select * into chest from public.daily_chests where id = p_chest_id and user_id = p_user_id for update;
  if not found then raise exception 'Chest was not found.' using errcode = 'P0002'; end if;
  if chest.status = 'opened' then
    return query select chest.id, chest.reward_core_amount;
    return;
  end if;
  if chest.opens_on > today then raise exception 'This chest opens tomorrow.' using errcode = 'P0001'; end if;
  if coalesce(p_earned_today, 0) < settings.key_core_amount then raise exception 'No key yet today.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.daily_chests where user_id = p_user_id and opened_on = today) then
    raise exception 'Today''s key is already used.' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(settings.odds) loop
    total_weight := total_weight + greatest(coalesce((item ->> 'weight')::numeric, 0), 0);
  end loop;
  roll := random() * total_weight;
  for item in select * from jsonb_array_elements(settings.odds) loop
    reward := coalesce((item ->> 'amount')::numeric, 0);
    roll := roll - greatest(coalesce((item ->> 'weight')::numeric, 0), 0);
    exit when roll < 0;
  end loop;

  if reward > 0 then
    update public.core_accounts set balance = balance + reward, updated_at = now() where user_id = p_user_id;
    if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  end if;
  update public.daily_chests
  set status = 'opened', reward_core_amount = reward, opened_on = today, opened_at = now()
  where id = chest.id;
  return query select chest.id, reward;
end;
$$;

revoke all on function public.open_daily_chest(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.open_daily_chest(uuid, uuid, numeric) to service_role;

commit;
