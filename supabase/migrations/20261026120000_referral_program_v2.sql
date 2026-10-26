-- Referral program v2 (founder decision 2026-10-26, docs/REFERRAL_PROGRAM_V2.md). For every invited person the referrer gets:
--   signup              +$0.1 Core at once (20261026090000, unchanged);
--   active              +$0.5 Core and +$0.05 Wallet when the invited person completes any quest besides sign-up;
--   active_bonus        the same again when the referrer has passed "I'm not a robot"; a referrer who passes it later
--                       gets this top-up for every active person invited before;
--   humanity_confirmed  +$1 Core and +$0.1 Wallet when the invited person passes "I'm not a robot".
-- Wallet parts go to Wallet only for a referrer who passed "I'm not a robot" (like the leader bonus), otherwise to
-- Core: fake accounts must not turn into withdrawable money. No daily limit. The old level-2 reward is set to 0
-- (replaced by "active"). Quests for 1, 5 and 10 invited people pay +$1 Core and +$0.1 Wallet each.

alter table public.referral_reward_settings
  add column if not exists active_core_amount numeric(30, 12) not null default 0.5 check (active_core_amount >= 0),
  add column if not exists active_wallet_amount numeric(30, 12) not null default 0.05 check (active_wallet_amount >= 0),
  add column if not exists confirmed_multiplier numeric(10, 4) not null default 2 check (confirmed_multiplier >= 1),
  add column if not exists humanity_core_amount numeric(30, 12) not null default 1 check (humanity_core_amount >= 0),
  add column if not exists humanity_wallet_amount numeric(30, 12) not null default 0.1 check (humanity_wallet_amount >= 0);

update public.referral_reward_settings set level_two_core_amount = 0, updated_at = now() where id = true;

alter table public.referral_rewards drop constraint if exists referral_rewards_kind_check;
alter table public.referral_rewards
  add constraint referral_rewards_kind_check check (kind in (
    'level_2', 'humanity_confirmed', 'signup', 'active', 'active_bonus',
    'humanity_confirmed_wallet', 'active_wallet', 'active_bonus_wallet'
  ));

-- One reward with a Core part and a Wallet part, once per invited person and kind, with one notification.
create or replace function public.pay_referral_pair(
  p_referrer_user_id uuid,
  p_referral_user_id uuid,
  p_kind text,
  p_core numeric,
  p_wallet numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.wallet_accounts%rowtype;
  to_wallet boolean := false;
  core_part numeric(30, 12) := greatest(coalesce(p_core, 0), 0);
  wallet_part numeric(30, 12) := greatest(coalesce(p_wallet, 0), 0);
  first_id uuid;
  wallet_id uuid;
  next_balance numeric(30, 12);
  body text;
begin
  if p_referrer_user_id is null or p_referrer_user_id = p_referral_user_id or core_part + wallet_part <= 0 then
    return;
  end if;
  if exists (select 1 from public.referral_rewards where referral_user_id = p_referral_user_id and kind in (p_kind, p_kind || '_wallet')) then
    return;
  end if;

  if wallet_part > 0 and public.is_humanity_confirmed(p_referrer_user_id) then
    select * into wallet_row from public.wallet_accounts where user_id = p_referrer_user_id for update;
    to_wallet := found;
  end if;
  if not to_wallet then
    core_part := core_part + wallet_part;
    wallet_part := 0;
  end if;

  if core_part > 0 then
    insert into public.referral_rewards (referrer_user_id, referral_user_id, kind, amount, destination)
    values (p_referrer_user_id, p_referral_user_id, p_kind, core_part, 'core')
    on conflict (referral_user_id, kind) do nothing
    returning id into first_id;
    if first_id is null then
      return;
    end if;
    update public.core_accounts set balance = balance + core_part, updated_at = now() where user_id = p_referrer_user_id;
  end if;

  if wallet_part > 0 then
    insert into public.referral_rewards (referrer_user_id, referral_user_id, kind, amount, destination)
    values (p_referrer_user_id, p_referral_user_id, p_kind || '_wallet', wallet_part, 'wallet')
    on conflict (referral_user_id, kind) do nothing
    returning id into wallet_id;
    if wallet_id is not null then
      next_balance := wallet_row.balance + wallet_part;
      update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = p_referrer_user_id;
      insert into public.wallet_ledger (
        user_id, direction, amount, currency_code, operation_type, source_type, source_id,
        counterparty_user_id, balance_after, idempotency_key, metadata
      )
      values (
        p_referrer_user_id, 'credit', wallet_part, wallet_row.currency_code, 'referral_reward', 'system', wallet_id,
        p_referral_user_id, next_balance, 'referral_reward:' || wallet_id::text,
        jsonb_build_object('kind', p_kind, 'referral_user_id', p_referral_user_id)
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
    first_id := coalesce(first_id, wallet_id);
  end if;
  if first_id is null then
    return;
  end if;

  body := p_reason || ': '
    || case when core_part > 0 then '+$' || trim(trailing '.' from trim(trailing '0' from core_part::numeric(30, 6)::text)) || ' в Core' else '' end
    || case when core_part > 0 and wallet_part > 0 then ' и ' else '' end
    || case when wallet_part > 0 then '+$' || trim(trailing '.' from trim(trailing '0' from wallet_part::numeric(30, 6)::text)) || ' в Wallet' else '' end
    || '.';
  perform public.create_notification_event(
    'rewards.referral', 'rewards', 'referral_reward', first_id::text,
    'Награда за приглашённого', body,
    '/?view=people.profile', array[p_referrer_user_id],
    'referral-reward:' || first_id::text, jsonb_build_object('kind', p_kind)
  );
end;
$$;

revoke all on function public.pay_referral_pair(uuid, uuid, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.pay_referral_pair(uuid, uuid, text, numeric, numeric, text) to service_role;

-- The invited person did a real quest: the "active" reward, and the top-up for a confirmed referrer.
create or replace function public.pay_referral_active(p_referrer_user_id uuid, p_referral_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.referral_reward_settings%rowtype;
begin
  select * into settings from public.referral_reward_settings where id = true;
  if not found or not settings.enabled or p_referrer_user_id is null then
    return;
  end if;
  if not exists (
    select 1 from public.user_challenges uc join public.challenges c on c.id = uc.challenge_id
    where uc.user_id = p_referral_user_id and uc.status = 'completed' and coalesce(c.verification_logic, '') <> 'signup'
  ) then
    return;
  end if;
  perform public.pay_referral_pair(p_referrer_user_id, p_referral_user_id, 'active', settings.active_core_amount, settings.active_wallet_amount, 'Приглашённый выполнил первое задание');
  if public.is_humanity_confirmed(p_referrer_user_id) and settings.confirmed_multiplier > 1 then
    perform public.pay_referral_pair(
      p_referrer_user_id, p_referral_user_id, 'active_bonus',
      settings.active_core_amount * (settings.confirmed_multiplier - 1), settings.active_wallet_amount * (settings.confirmed_multiplier - 1),
      'Бонус за ваше «Я не робот»'
    );
  end if;
end;
$$;

revoke all on function public.pay_referral_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_referral_active(uuid, uuid) to service_role;

create or replace function public.referral_active_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer uuid;
begin
  if new.status is distinct from 'completed' or (tg_op = 'UPDATE' and old.status is not distinct from 'completed') then
    return new;
  end if;
  select edge.referrer_user_id into referrer from public.referral_edges edge where edge.referral_user_id = new.user_id;
  if referrer is not null then
    perform public.pay_referral_active(referrer, new.user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.referral_active_reward() from public, anon, authenticated;

drop trigger if exists referral_active_reward on public.user_challenges;
create trigger referral_active_reward
after insert or update of status on public.user_challenges
for each row execute function public.referral_active_reward();

-- Sign-up: +$0.1 at once; a person who already did a quest before the link was claimed counts as active too.
create or replace function public.referral_signup_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.referral_reward_settings%rowtype;
begin
  select * into settings from public.referral_reward_settings where id = true;
  if not found or not settings.enabled or new.referrer_user_id is null then
    return new;
  end if;
  perform public.pay_referral_reward(new.referrer_user_id, new.referral_user_id, 'signup', settings.signup_core_amount, false);
  perform public.pay_referral_active(new.referrer_user_id, new.referral_user_id);
  return new;
end;
$$;

-- "I'm not a robot": the invited person's reward for the referrer, and the person's own top-up for the people they
-- invited earlier.
create or replace function public.referral_humanity_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.referral_reward_settings%rowtype;
  referrer uuid;
  invited record;
begin
  if new.humanity_level < 2 or (tg_op = 'UPDATE' and old.humanity_level >= 2) then
    return new;
  end if;
  select * into settings from public.referral_reward_settings where id = true;
  if not found or not settings.enabled then
    return new;
  end if;

  select edge.referrer_user_id into referrer from public.referral_edges edge where edge.referral_user_id = new.user_id;
  if referrer is not null then
    perform public.pay_referral_pair(referrer, new.user_id, 'humanity_confirmed', settings.humanity_core_amount, settings.humanity_wallet_amount, 'Приглашённый прошёл «Я не робот»');
  end if;

  if settings.confirmed_multiplier > 1 then
    for invited in
      select r.referral_user_id from public.referral_rewards r
      where r.referrer_user_id = new.user_id and r.kind = 'active'
    loop
      perform public.pay_referral_pair(
        new.user_id, invited.referral_user_id, 'active_bonus',
        settings.active_core_amount * (settings.confirmed_multiplier - 1), settings.active_wallet_amount * (settings.confirmed_multiplier - 1),
        'Бонус за ваше «Я не робот»'
      );
    end loop;
  end if;
  return new;
end;
$$;

-- People invited before today get what the new rules give for what they already did.
do $$
declare
  edge record;
  settings public.referral_reward_settings%rowtype;
begin
  select * into settings from public.referral_reward_settings where id = true;
  for edge in select referrer_user_id, referral_user_id from public.referral_edges loop
    perform public.pay_referral_active(edge.referrer_user_id, edge.referral_user_id);
    if settings.enabled and public.is_humanity_confirmed(edge.referral_user_id) then
      perform public.pay_referral_pair(edge.referrer_user_id, edge.referral_user_id, 'humanity_confirmed', settings.humanity_core_amount, settings.humanity_wallet_amount, 'Приглашённый прошёл «Я не робот»');
    end if;
  end loop;
end;
$$;

-- Quests: the first invited person, then 5 and 10 active ones (the same "active" as above).
update public.challenges
set wallet_reward_amount = 0.1,
    title = '{"ru":"Пригласи друга","en":"Invite a friend"}'::jsonb,
    description = '{"ru":"Пошаговый квест: как работают реферальные и лидерские бонусы, сколько можно получить за 10 человек и как разослать ссылку. Награда, когда по твоей ссылке зарегистрируется первый человек.","en":"A step-by-step quest: how referral and leader bonuses work, what 10 people can bring and how to send your link. The reward comes when the first person signs up through your link."}'::jsonb,
    requirements = '{"ru":"Хотя бы один человек зарегистрировался по твоей ссылке.","en":"At least one person has signed up with your link."}'::jsonb
where id = '1b520e42-d5d2-4eb1-81bf-c16d12d4e246';

insert into public.challenges (
  id, title, description, instructions, requirements, category, difficulty_level, duration_days, verification_type,
  verification_logic, sort_order, prerequisite_challenge_id, core_reward_amount, wallet_reward_amount, is_active, is_permanent, unlock_at_completed
) values
(
  '66ec1e3d-21a3-4f9e-8a21-44a4bfc79c00',
  '{"ru":"5 друзей в деле","en":"5 friends in action"}'::jsonb,
  '{"ru":"Пять приглашённых тобой людей выполнили хотя бы одно задание.","en":"Five people you invited have done at least one quest."}'::jsonb,
  '{"ru":"1. Отправляй свою ссылку из квеста «Пригласи друга» или из профиля.\n2. Помоги новичку сделать первый шаг: покажи, где квесты.\n3. Когда пятеро сделают задание, нажми «Проверить выполнение».","en":"1. Send your link from the \"Invite a friend\" quest or your profile.\n2. Help a newcomer take the first step: show them the quests.\n3. When five have done a quest, press \"Check completion\"."}'::jsonb,
  '{"ru":"5 приглашённых выполнили хотя бы одно задание.","en":"5 invited people have done at least one quest."}'::jsonb,
  'social', 2, 30, 'auto', 'referrals_active_5', 111, '1b520e42-d5d2-4eb1-81bf-c16d12d4e246', 1, 0.1, true, false, 0
),
(
  '36516b55-3250-45b5-9e03-cd66604563dd',
  '{"ru":"10 друзей в деле","en":"10 friends in action"}'::jsonb,
  '{"ru":"Десять приглашённых тобой людей выполнили хотя бы одно задание. Это уже твоя команда: с её роста идёт лидерский бонус.","en":"Ten people you invited have done at least one quest. That is your team now: its growth brings you the leader bonus."}'::jsonb,
  '{"ru":"1. Продолжай рассылать ссылку: знакомым, в чаты, в живом разговоре по QR.\n2. Помогай своим новичкам с первыми квестами.\n3. Когда десятеро сделают задание, нажми «Проверить выполнение».","en":"1. Keep sending your link: to people you know, to chats, by QR in a live talk.\n2. Help your newcomers with their first quests.\n3. When ten have done a quest, press \"Check completion\"."}'::jsonb,
  '{"ru":"10 приглашённых выполнили хотя бы одно задание.","en":"10 invited people have done at least one quest."}'::jsonb,
  'social', 3, 60, 'auto', 'referrals_active_10', 112, '66ec1e3d-21a3-4f9e-8a21-44a4bfc79c00', 1, 0.1, true, false, 0
)
on conflict (id) do nothing;

update public.challenges
set description = '{"ru":"Награды за приглашённых приходят сами: +$0.1 за регистрацию, +$0.5 Core и +$0.05 Wallet за его первое задание (вдвое больше, если ты прошёл «Я не робот»), +$1 Core и +$0.1 Wallet, когда он пройдёт «Я не робот». И бессрочно лидерский бонус: 10% от роста Core твоей команды.","en":"Rewards for invited people come by themselves: +$0.1 for signing up, +$0.5 Core and +$0.05 Wallet for their first quest (twice as much if you passed \"I''m not a robot\"), +$1 Core and +$0.1 Wallet when they pass \"I''m not a robot\". And the leader bonus with no end date: 10% of your team''s Core growth."}'::jsonb,
    instructions = '{"ru":"1. Пройди квест «Пригласи друга»: там вся схема и готовые тексты.\n2. Отправляй ссылку кому угодно, ограничений нет.\n3. Пройди «Я не робот»: награды за первое задание приглашённых удвоятся, в том числе за тех, кто пришёл раньше.\n4. Награды начисляются сами; статистика здесь и в профиле.","en":"1. Do the \"Invite a friend\" quest: the whole scheme and ready texts are there.\n2. Send your link to anyone, there is no limit.\n3. Pass \"I''m not a robot\": rewards for invited people''s first quest double, including for those who came earlier.\n4. Rewards are paid by themselves; the numbers are here and in your profile."}'::jsonb
where id = '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a04';
