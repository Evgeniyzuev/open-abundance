-- Referral rewards, paid automatically and recorded once per invited user:
--   1) registration: when an invited user registers through a referral link, the referrer gets a
--      Core reward (default $1). It goes to Core because the invited account is not confirmed yet.
--   2) humanity_confirmed: when the invited user passes the humanity check, the referrer gets a
--      reward (default $1) in Wallet if the referrer is humanity-confirmed too, otherwise in Core.
-- Both are idempotent (one per invited user and kind), configurable in referral_reward_settings and
-- announced to the referrer through the notification center.

create table if not exists public.referral_reward_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  registration_core_amount numeric(30, 12) not null default 1 check (registration_core_amount >= 0),
  humanity_amount numeric(30, 12) not null default 1 check (humanity_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.referral_reward_settings (id) values (true) on conflict (id) do nothing;

alter table public.referral_reward_settings enable row level security;
revoke all on public.referral_reward_settings from public, anon, authenticated;
grant select, insert, update on public.referral_reward_settings to service_role;

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('registration', 'humanity_confirmed')),
  amount numeric(30, 12) not null check (amount > 0),
  destination text not null check (destination in ('wallet', 'core')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (referral_user_id, kind)
);

create index if not exists referral_rewards_referrer_created_idx
  on public.referral_rewards (referrer_user_id, created_at desc);

alter table public.referral_rewards enable row level security;
revoke all on public.referral_rewards from public, anon, authenticated;
grant select, insert, update on public.referral_rewards to service_role;

-- Allow the new ledger operation type without rewriting the list by hand.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'wallet_ledger_operation_type_check'
    and conrelid = 'public.wallet_ledger'::regclass;

  if def is not null and position('referral_reward' in def) = 0 then
    alter table public.wallet_ledger drop constraint wallet_ledger_operation_type_check;
    execute 'alter table public.wallet_ledger add constraint wallet_ledger_operation_type_check '
      || replace(def, '''system_adjustment''::text', '''system_adjustment''::text, ''referral_reward''::text');
  end if;
end;
$$;

create or replace function public.pay_referral_reward(
  p_referrer_user_id uuid,
  p_referral_user_id uuid,
  p_kind text,
  p_amount numeric,
  p_prefer_wallet boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_id uuid;
  destination text := 'core';
  wallet_row public.wallet_accounts%rowtype;
  next_balance numeric(30, 12);
begin
  if p_amount is null or p_amount <= 0 or p_referrer_user_id = p_referral_user_id then
    return;
  end if;

  if p_prefer_wallet and public.is_humanity_confirmed(p_referrer_user_id) then
    select * into wallet_row from public.wallet_accounts where user_id = p_referrer_user_id for update;
    if found then
      destination := 'wallet';
    end if;
  end if;

  insert into public.referral_rewards (referrer_user_id, referral_user_id, kind, amount, destination)
  values (p_referrer_user_id, p_referral_user_id, p_kind, p_amount, destination)
  on conflict (referral_user_id, kind) do nothing
  returning id into reward_id;

  if reward_id is null then
    return;
  end if;

  if destination = 'wallet' then
    next_balance := wallet_row.balance + p_amount;
    update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_referrer_user_id;
    insert into public.wallet_ledger (
      user_id, direction, amount, currency_code, operation_type, source_type, source_id,
      counterparty_user_id, balance_after, idempotency_key, metadata
    )
    values (
      p_referrer_user_id, 'credit', p_amount, wallet_row.currency_code, 'referral_reward', 'system', reward_id,
      p_referral_user_id, next_balance, 'referral_reward:' || reward_id::text,
      jsonb_build_object('kind', p_kind, 'referral_user_id', p_referral_user_id)
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  else
    update public.core_accounts set balance = balance + p_amount, updated_at = now() where user_id = p_referrer_user_id;
  end if;

  perform public.create_notification_event(
    'rewards.referral', 'rewards', 'referral_reward', reward_id::text,
    'Награда за приглашённого',
    case p_kind
      when 'registration' then 'Новый участник зарегистрировался по вашей ссылке: +$' || trim(trailing '.' from trim(trailing '0' from p_amount::numeric(30, 6)::text)) || ' в Core.'
      else 'Приглашённый участник подтвердил, что он человек: +$' || trim(trailing '.' from trim(trailing '0' from p_amount::numeric(30, 6)::text)) || case destination when 'wallet' then ' в Wallet.' else ' в Core.' end
    end,
    '/?view=people.profile', array[p_referrer_user_id],
    'referral-reward:' || reward_id::text, jsonb_build_object('kind', p_kind, 'destination', destination)
  );
end;
$$;

revoke all on function public.pay_referral_reward(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.pay_referral_reward(uuid, uuid, text, numeric, boolean) to service_role;

create or replace function public.referral_edge_registration_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.referral_reward_settings%rowtype;
begin
  select * into settings from public.referral_reward_settings where id = true;
  if found and settings.enabled then
    perform public.pay_referral_reward(new.referrer_user_id, new.referral_user_id, 'registration', settings.registration_core_amount, false);
  end if;
  return new;
end;
$$;

revoke all on function public.referral_edge_registration_reward() from public, anon, authenticated;

drop trigger if exists referral_edge_registration_reward on public.referral_edges;
create trigger referral_edge_registration_reward
after insert on public.referral_edges
for each row execute function public.referral_edge_registration_reward();

create or replace function public.referral_humanity_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.referral_reward_settings%rowtype;
  referrer uuid;
begin
  if new.humanity_level < 2 or (tg_op = 'UPDATE' and old.humanity_level >= 2) then
    return new;
  end if;

  select * into settings from public.referral_reward_settings where id = true;
  if not found or not settings.enabled then
    return new;
  end if;

  select edge.referrer_user_id into referrer
  from public.referral_edges edge
  where edge.referral_user_id = new.user_id;

  if referrer is not null then
    perform public.pay_referral_reward(referrer, new.user_id, 'humanity_confirmed', settings.humanity_amount, true);
  end if;
  return new;
end;
$$;

revoke all on function public.referral_humanity_reward() from public, anon, authenticated;

drop trigger if exists referral_humanity_reward on public.humanity_verifications;
create trigger referral_humanity_reward
after insert or update of humanity_level on public.humanity_verifications
for each row execute function public.referral_humanity_reward();

-- The permanent challenge that explains the program. It never completes: rewards are paid automatically.
insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active, is_permanent
) values (
  '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a04',
  '{"ru":"Реферальная программа","en":"Referral program"}'::jsonb,
  '{"ru":"Приглашайте людей и получайте награды автоматически: за каждого нового участника и за подтверждение им человечности.","en":"Invite people and receive rewards automatically: for every new participant and for their humanity confirmation."}'::jsonb,
  '{"ru":"1. Откройте «Тексты и список для приглашений» и отправьте сообщение.\n2. Когда человек зарегистрируется по вашей ссылке, вы получите награду за нового участника.\n3. Когда он подтвердит, что он человек, вы получите вторую награду.\n4. Награды начисляются сами; статистика и суммы видны здесь и в профиле.","en":"1. Open \"Messages and checklist for invitations\" and send a message.\n2. When someone signs up with your link, you get a reward for a new participant.\n3. When they confirm they are a person, you get a second reward.\n4. Rewards are paid automatically; statistics and amounts are shown here and in your profile."}'::jsonb,
  '{"ru":"Постоянный челлендж: награды начисляются автоматически, проверять выполнение не нужно.","en":"Ongoing challenge: rewards are paid automatically, no check is needed."}'::jsonb,
  'social', 1, 365, 'auto', 'referral_program',
  33, 'people.profile', 0, 0, true, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    duration_days = excluded.duration_days,
    verification_type = excluded.verification_type,
    verification_logic = excluded.verification_logic,
    sort_order = excluded.sort_order,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount,
    is_permanent = excluded.is_permanent;
