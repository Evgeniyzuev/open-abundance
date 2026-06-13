create table if not exists public.user_core_growth_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null default 'core_amount' check (target_type in ('core_amount', 'daily_income')),
  target_value numeric(30, 12) not null check (target_value >= 0),
  start_core numeric(30, 12) not null default 0 check (start_core >= 0),
  daily_additions numeric(30, 12) not null default 0 check (daily_additions >= 0),
  reinvest_percent numeric(5, 2) not null default 0 check (reinvest_percent >= 0 and reinvest_percent <= 100),
  calculated_days_to_goal integer check (calculated_days_to_goal is null or calculated_days_to_goal >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_core_growth_plans_one_active_idx
on public.user_core_growth_plans (user_id)
where is_active = true;

create index if not exists user_core_growth_plans_user_updated_idx
on public.user_core_growth_plans (user_id, updated_at desc);

create table if not exists public.user_today_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null default 'UTC',
  status text not null default 'accepted' check (status in ('accepted', 'completed', 'expired')),
  target_core numeric(30, 12) not null default 1 check (target_core >= 0),
  progress_core numeric(30, 12) not null default 0 check (progress_core >= 0),
  core_growth_plan_id uuid references public.user_core_growth_plans(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  info_seen_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index if not exists user_today_instances_user_date_idx
on public.user_today_instances (user_id, local_date desc);

create table if not exists public.user_today_items (
  id uuid primary key default gen_random_uuid(),
  today_instance_id uuid not null references public.user_today_instances(id) on delete cascade,
  item_key text not null,
  source_type text not null default 'system' check (source_type in ('system', 'task', 'challenge', 'wallet', 'project', 'wish', 'social')),
  source_id uuid,
  title jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (today_instance_id, item_key)
);

create index if not exists user_today_items_instance_sort_idx
on public.user_today_items (today_instance_id, sort_order);

create table if not exists public.today_progress_events (
  id uuid primary key default gen_random_uuid(),
  today_instance_id uuid not null references public.user_today_instances(id) on delete cascade,
  source_type text not null check (source_type in ('challenge_reward', 'wallet_core_topup', 'task_reward', 'project_reward', 'manual')),
  source_id uuid not null,
  amount_core numeric(30, 12) not null check (amount_core > 0),
  created_at timestamptz not null default now(),
  unique (today_instance_id, source_type, source_id)
);

create index if not exists today_progress_events_instance_idx
on public.today_progress_events (today_instance_id, created_at desc);

alter table public.user_core_growth_plans enable row level security;
alter table public.user_today_instances enable row level security;
alter table public.user_today_items enable row level security;
alter table public.today_progress_events enable row level security;

grant select on table public.user_core_growth_plans to authenticated;
grant select on table public.user_today_instances to authenticated;
grant select on table public.user_today_items to authenticated;
grant select on table public.today_progress_events to authenticated;

grant select, insert, update, delete on table public.user_core_growth_plans to service_role;
grant select, insert, update, delete on table public.user_today_instances to service_role;
grant select, insert, update, delete on table public.user_today_items to service_role;
grant select, insert, update, delete on table public.today_progress_events to service_role;

drop policy if exists "Users can read own core growth plans" on public.user_core_growth_plans;
create policy "Users can read own core growth plans"
on public.user_core_growth_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own today instances" on public.user_today_instances;
create policy "Users can read own today instances"
on public.user_today_instances
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own today items" on public.user_today_items;
create policy "Users can read own today items"
on public.user_today_items
for select
to authenticated
using (
  exists (
    select 1
    from public.user_today_instances
    where user_today_instances.id = user_today_items.today_instance_id
      and user_today_instances.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read own today progress events" on public.today_progress_events;
create policy "Users can read own today progress events"
on public.today_progress_events
for select
to authenticated
using (
  exists (
    select 1
    from public.user_today_instances
    where user_today_instances.id = today_progress_events.today_instance_id
      and user_today_instances.user_id = (select auth.uid())
  )
);

drop trigger if exists touch_user_core_growth_plans_updated_at on public.user_core_growth_plans;
create trigger touch_user_core_growth_plans_updated_at
before update on public.user_core_growth_plans
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_user_today_instances_updated_at on public.user_today_instances;
create trigger touch_user_today_instances_updated_at
before update on public.user_today_instances
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_user_today_items_updated_at on public.user_today_items;
create trigger touch_user_today_items_updated_at
before update on public.user_today_items
for each row
execute function public.touch_updated_at();
