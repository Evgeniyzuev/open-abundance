-- OA Expedition: typed challenge activities, server-confirmed milestones,
-- and idempotent Core/artifact award records.

alter table public.challenges
  add column if not exists activity_type text not null default 'mission',
  add column if not exists reward_mode text not null default 'guaranteed',
  add column if not exists reward_limit integer,
  add column if not exists competition_closes_at timestamptz,
  add column if not exists ranking_metric text;

-- Existing track_key/track_step remain the compatibility path. An explicit
-- quest parent relation is deferred until a real quest catalog needs it; do
-- not duplicate those fields in this binary/milestone migration.

alter table public.challenges
  drop constraint if exists challenges_activity_type_check;
alter table public.challenges
  add constraint challenges_activity_type_check
  check (activity_type in ('challenge', 'mission', 'quest'));

alter table public.challenges
  drop constraint if exists challenges_reward_mode_check;
alter table public.challenges
  add constraint challenges_reward_mode_check
  check (reward_mode in ('guaranteed', 'first_n', 'top_n'));

alter table public.challenges
  drop constraint if exists challenges_reward_mode_requirements_check;
alter table public.challenges
  add constraint challenges_reward_mode_requirements_check
  check (
    (reward_mode = 'guaranteed' and reward_limit is null and competition_closes_at is null)
    or (reward_mode = 'first_n' and reward_limit is not null and reward_limit > 0)
    or (reward_mode = 'top_n' and reward_limit is not null and reward_limit > 0 and competition_closes_at is not null and ranking_metric is not null)
  );

create table if not exists public.challenge_milestones (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  milestone_key text not null,
  step_order integer not null check (step_order > 0),
  progress_weight numeric(5,2) not null check (progress_weight > 0 and progress_weight <= 100),
  core_reward_amount numeric(30,12) not null check (core_reward_amount > 0),
  verification_logic text not null,
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  item_reward jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, milestone_key),
  unique (challenge_id, step_order)
);

create index if not exists challenge_milestones_challenge_idx
  on public.challenge_milestones (challenge_id, step_order);

create table if not exists public.challenge_milestone_awards (
  id uuid primary key default gen_random_uuid(),
  user_challenge_id uuid not null references public.user_challenges(id) on delete cascade,
  milestone_id uuid not null references public.challenge_milestones(id) on delete cascade,
  core_reward_amount numeric(30,12) not null check (core_reward_amount >= 0),
  artifact_id uuid references public.user_artifacts(id) on delete set null,
  verification_data jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  awarded_at timestamptz not null default now(),
  unique (user_challenge_id, milestone_id)
);

create index if not exists challenge_milestone_awards_user_idx
  on public.challenge_milestone_awards (user_challenge_id, awarded_at desc);
create index if not exists challenge_milestone_awards_milestone_idx
  on public.challenge_milestone_awards (milestone_id);

alter table public.challenge_milestones enable row level security;
alter table public.challenge_milestone_awards enable row level security;

grant select on table public.challenge_milestones to authenticated;
grant select on table public.challenge_milestone_awards to authenticated;
grant select, insert, update, delete on table public.challenge_milestones to service_role;
grant select, insert, update, delete on table public.challenge_milestone_awards to service_role;

drop policy if exists "Authenticated users can read active challenge milestones" on public.challenge_milestones;
create policy "Authenticated users can read active challenge milestones"
on public.challenge_milestones
for select
to authenticated
using (is_active = true);

drop policy if exists "Users can read own challenge milestone awards" on public.challenge_milestone_awards;
create policy "Users can read own challenge milestone awards"
on public.challenge_milestone_awards
for select
to authenticated
using (
  exists (
    select 1
    from public.user_challenges progress
    where progress.id = user_challenge_id
      and progress.user_id = (select auth.uid())
  )
);

drop trigger if exists touch_challenge_milestones_updated_at on public.challenge_milestones;
create trigger touch_challenge_milestones_updated_at
before update on public.challenge_milestones
for each row execute function public.touch_updated_at();

-- Existing catalog records remain guaranteed missions unless explicitly changed.
update public.challenges
set activity_type = coalesce(nullif(activity_type, ''), 'mission'),
    reward_mode = coalesce(nullif(reward_mode, ''), 'guaranteed')
where activity_type is null or reward_mode is null or activity_type = '' or reward_mode = '';

-- Existing catalog records remain guaranteed missions unless explicitly changed.
-- Simple binary challenges intentionally stay on user_challenges and the
-- existing full-completion settlement path. A future quest migration should
-- explicitly insert its milestone definitions; this migration must not create
-- one redundant "completion" row for every existing challenge.

-- Cross-row limits cannot be expressed by a plain CHECK constraint. Keep the
-- milestone catalog from exceeding the parent challenge's Core budget or a
-- 100-point progress scale when a future quest definition is added.
create or replace function public.validate_challenge_milestone_definition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_core numeric;
  existing_core numeric;
  existing_weight numeric;
begin
  if not new.is_active then
    return new;
  end if;

  select core_reward_amount into challenge_core
  from public.challenges
  where id = new.challenge_id;

  if challenge_core is null then
    raise exception 'Parent challenge was not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(core_reward_amount), 0), coalesce(sum(progress_weight), 0)
    into existing_core, existing_weight
  from public.challenge_milestones
  where challenge_id = new.challenge_id
    and id <> new.id
    and is_active = true;

  if existing_core + new.core_reward_amount > challenge_core then
    raise exception 'Milestone Core rewards exceed the parent challenge reward.' using errcode = '23514';
  end if;
  if existing_weight + new.progress_weight > 100 then
    raise exception 'Milestone progress weights exceed 100.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_challenge_milestone_definition on public.challenge_milestones;
create trigger validate_challenge_milestone_definition
before insert or update on public.challenge_milestones
for each row execute function public.validate_challenge_milestone_definition();

revoke all on function public.validate_challenge_milestone_definition() from public, anon, authenticated;
grant execute on function public.validate_challenge_milestone_definition() to service_role;

create or replace function public.settle_user_challenge_milestone(
  p_user_id uuid,
  p_challenge_id uuid,
  p_milestone_key text,
  p_verified boolean
)
returns table (
  milestone_awarded boolean,
  challenge_status text,
  core_awarded numeric,
  progress_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  milestone_row public.challenge_milestones%rowtype;
  progress_row public.user_challenges%rowtype;
  existing_award public.challenge_milestone_awards%rowtype;
  total_weight numeric;
  completed_weight numeric;
  next_core numeric;
  challenge_completed boolean;
  created_artifact_id uuid;
  artifact_title text;
  artifact_type text;
  artifact_rarity text;
begin
  if p_user_id is null or p_challenge_id is null or p_milestone_key is null or not p_verified then
    raise exception 'Verified user, challenge, milestone are required.' using errcode = '22023';
  end if;

  select * into challenge_row
  from public.challenges
  where id = p_challenge_id and is_active = true;
  if not found then
    raise exception 'Active challenge was not found.' using errcode = 'P0002';
  end if;

  select * into milestone_row
  from public.challenge_milestones
  where challenge_id = p_challenge_id
    and milestone_key = p_milestone_key
    and is_active = true
  for update;
  if not found then
    raise exception 'Active challenge milestone was not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(progress_weight), 0)
    into total_weight
  from public.challenge_milestones
  where challenge_id = p_challenge_id and is_active = true;
  if total_weight <> 100 then
    raise exception 'Active milestone progress weights must total 100.' using errcode = '23514';
  end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update set updated_at = now();

  select * into progress_row
  from public.user_challenges
  where user_id = p_user_id and challenge_id = p_challenge_id
  for update;

  select * into existing_award
  from public.challenge_milestone_awards
  where user_challenge_id = progress_row.id and milestone_id = milestone_row.id;

  if found then
    select coalesce(sum(m.progress_weight), 0), coalesce(sum(case when a.id is not null then m.progress_weight else 0 end), 0)
      into total_weight, completed_weight
    from public.challenge_milestones m
    left join public.challenge_milestone_awards a
      on a.milestone_id = m.id and a.user_challenge_id = progress_row.id
    where m.challenge_id = p_challenge_id and m.is_active = true;
    return query select false, progress_row.status, 0::numeric,
      round(case when total_weight > 0 then completed_weight / total_weight * 100 else 0 end, 2);
    return;
  end if;

  update public.core_accounts
  set balance = balance + milestone_row.core_reward_amount,
      updated_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception 'Core account is not created yet.' using errcode = 'P0002';
  end if;

  if milestone_row.item_reward is not null then
    artifact_title := coalesce(
      nullif(milestone_row.item_reward ->> 'title', ''),
      nullif(milestone_row.title ->> 'en', ''),
      'Expedition find'
    );
    artifact_type := coalesce(nullif(milestone_row.item_reward ->> 'artifact_type', ''), 'expedition_find');
    artifact_rarity := case milestone_row.item_reward ->> 'rarity'
      when 'rare' then 'rare'
      when 'epic' then 'epic'
      when 'system' then 'system'
      else 'common'
    end;
    insert into public.user_artifacts (
      user_id, artifact_type, title, description, rarity, visibility,
      transferable, source_type, source_id, metadata
    ) values (
      p_user_id,
      artifact_type,
      artifact_title,
      nullif(milestone_row.item_reward ->> 'description', ''),
      artifact_rarity,
      'private',
      false,
      'challenge',
      p_challenge_id,
      milestone_row.item_reward
    ) returning id into created_artifact_id;
  end if;

  insert into public.challenge_milestone_awards (
    user_challenge_id,
    milestone_id,
    core_reward_amount,
    artifact_id,
    verification_data,
    idempotency_key
  ) values (
    progress_row.id,
    milestone_row.id,
    milestone_row.core_reward_amount,
    created_artifact_id,
    jsonb_build_object('verification_logic', milestone_row.verification_logic),
    'challenge:' || progress_row.id::text || ':milestone:' || milestone_row.id::text
  );

  select coalesce(sum(m.progress_weight), 0), coalesce(sum(case when a.id is not null then m.progress_weight else 0 end), 0)
    into total_weight, completed_weight
  from public.challenge_milestones m
  left join public.challenge_milestone_awards a
    on a.milestone_id = m.id and a.user_challenge_id = progress_row.id
  where m.challenge_id = p_challenge_id and m.is_active = true;

  challenge_completed := total_weight > 0 and completed_weight >= total_weight;
  select coalesce(sum(core_reward_amount), 0) into next_core
  from public.challenge_milestone_awards
  where user_challenge_id = progress_row.id;

  update public.user_challenges
  set status = case when challenge_completed then 'completed' else 'accepted' end,
      core_reward_amount = next_core,
      reward_account = 'core',
      reward_amount = next_core,
      reward_settled_at = case when challenge_completed then now() else reward_settled_at end,
      reward_idempotency_key = 'challenge:' || progress_row.id::text || ':milestones',
      updated_at = now()
  where id = progress_row.id;

  return query select true,
    case when challenge_completed then 'completed' else 'accepted' end,
    milestone_row.core_reward_amount,
    round(case when total_weight > 0 then completed_weight / total_weight * 100 else 0 end, 2);
end;
$$;

revoke all on function public.settle_user_challenge_milestone(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.settle_user_challenge_milestone(uuid, uuid, text, boolean) to service_role;

-- Keep the existing full-completion API compatible. Milestone-backed challenges
-- settle their complete schedule once; legacy challenges retain the old path.
create or replace function public.settle_user_challenge_rewards(
  p_user_id uuid,
  p_challenge_id uuid
)
returns table (
  challenge_status text,
  reward_claimed boolean,
  rewarded_core_amount numeric,
  rewarded_wallet_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  existing public.user_challenges%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_wallet_balance numeric(30, 12);
  reward_key text;
  milestone_key text;
  milestone_result record;
  claimed boolean := false;
begin
  select * into challenge_row from public.challenges where id = p_challenge_id and is_active = true;
  if not found then raise exception 'Active challenge was not found.' using errcode = 'P0002'; end if;

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update set updated_at = now();
  select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id for update;

  if exists (select 1 from public.challenge_milestones where challenge_id = p_challenge_id and is_active = true) then
    for milestone_key in
      select milestone_key from public.challenge_milestones where challenge_id = p_challenge_id and is_active = true order by step_order
    loop
      select * into milestone_result from public.settle_user_challenge_milestone(p_user_id, p_challenge_id, milestone_key, true);
      claimed := claimed or coalesce(milestone_result.milestone_awarded, false);
    end loop;
    select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id;
    return query select existing.status, claimed, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  if existing.status = 'completed' then
    return query select existing.status, false, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  reward_key := 'challenge:' || existing.id::text || ':reward';
  if challenge_row.core_reward_amount > 0 then
    update public.core_accounts set balance = balance + challenge_row.core_reward_amount, updated_at = now() where user_id = p_user_id;
    if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  end if;
  if challenge_row.wallet_reward_amount > 0 then
    select * into wallet from public.wallet_accounts where user_id = p_user_id for update;
    if not found then raise exception 'Wallet is not created yet.' using errcode = 'P0002'; end if;
    next_wallet_balance := wallet.balance + challenge_row.wallet_reward_amount;
    update public.wallet_accounts set balance = next_wallet_balance, updated_at = now() where user_id = p_user_id;
    insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_user_id, 'credit', challenge_row.wallet_reward_amount, wallet.currency_code, 'challenge_reward', 'challenge', existing.id, next_wallet_balance, reward_key || ':wallet', jsonb_build_object('challenge_id', p_challenge_id))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
  update public.user_challenges
  set status = 'completed', core_reward_amount = challenge_row.core_reward_amount, wallet_reward_amount = challenge_row.wallet_reward_amount,
      reward_account = case when challenge_row.core_reward_amount > 0 then 'core' else 'wallet' end,
      reward_amount = case when challenge_row.core_reward_amount > 0 then challenge_row.core_reward_amount else challenge_row.wallet_reward_amount end,
      reward_settled_at = now(), reward_idempotency_key = reward_key, updated_at = now()
  where id = existing.id;
  return query select 'completed'::text, true, challenge_row.core_reward_amount, challenge_row.wallet_reward_amount;
end;
$$;

revoke all on function public.settle_user_challenge_rewards(uuid, uuid) from public, anon, authenticated;
grant execute on function public.settle_user_challenge_rewards(uuid, uuid) to service_role;
