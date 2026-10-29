-- Founder decision 2026-10-29: one task «Будем на связи» instead of «Подключи Telegram-бота» + «Включи уведомления».
-- Three steps (bot Start, app installed, notifications on in the app), each skippable, $0.3 Core per step shown;
-- the reward for the steps done is paid at the end, each step only once. Taken again later, the task shows only the
-- steps not rewarded yet. Reuses the app_installed row; people who already completed it keep it completed.
begin;

update public.challenges set
  title = '{"ru": "Будем на связи", "en": "Stay in touch"}',
  description = '{"ru": "Чтобы не пропускать награды и новые задания, будем на связи. Три шага, за каждый $0.3 в Core. Любой шаг можно пропустить, награда за сделанные придёт в конце. Пропущенные шаги можно сделать позже.", "en": "So you never miss rewards and new tasks, let''s stay in touch. Three steps, $0.3 in Core each. Any step can be skipped; the reward for the steps you did comes at the end. Skipped steps can be done later."}',
  instructions = '{"ru": "1. Включи уведомления в Telegram-боте: открой бота и нажми «Старт».\n2. Установи приложение на телефон.\n3. Включи уведомления в приложении.\nЗатем нажми «Забрать награду».", "en": "1. Turn on notifications in the Telegram bot: open the bot and press Start.\n2. Install the app on your phone.\n3. Turn on notifications in the app.\nThen tap Claim reward."}',
  requirements = '{"ru": "За каждый сделанный шаг $0.3 в Core, один раз за шаг.", "en": "$0.3 in Core for each step done, once per step."}',
  core_reward_amount = 0.90,
  wallet_reward_amount = 0
where verification_logic = 'app_installed';

-- The separate Telegram-bot task is switched off (Evgen: the same thing is not paid twice); so is the push-code task,
-- which paid for what the notifications step pays now. This task takes step 3.
update public.challenges set path_order = null, is_active = false where verification_logic in ('code_telegram', 'code_push');
-- Who already got the Telegram-bot reward has the bot step counted as rewarded here.
insert into public.user_challenges (user_id, challenge_id, status, verification_data, updated_at)
select done.user_id, task.id, 'accepted', '{"stay_rewarded_steps": ["bot"]}'::jsonb, now()
from public.user_challenges done
join public.challenges old_task on old_task.id = done.challenge_id and old_task.verification_logic = 'code_telegram'
cross join (select id from public.challenges where verification_logic = 'app_installed') task
where done.status = 'completed'
on conflict (user_id, challenge_id) do update
set verification_data = coalesce(public.user_challenges.verification_data, '{}'::jsonb) || '{"stay_rewarded_steps": ["bot"]}'::jsonb
where public.user_challenges.status <> 'completed';
update public.challenges set path_order = 3 where verification_logic = 'app_installed';

create or replace function public.settle_stay_in_touch(p_user_id uuid, p_challenge_id uuid, p_steps text[])
returns table (challenge_status text, reward_claimed boolean, rewarded_core_amount numeric, rewarded_wallet_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  existing public.user_challenges%rowtype;
  rewarded text[];
  fresh text[];
  per_step numeric(30, 12);
  reward numeric(30, 12);
  all_done boolean;
  next_status text;
begin
  select * into challenge_row from public.challenges where id = p_challenge_id and is_active = true and verification_logic = 'app_installed';
  if not found then raise exception 'Active stay-in-touch task was not found.' using errcode = 'P0002'; end if;

  select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id for update;
  if not found then raise exception 'Take the task first.' using errcode = 'P0001'; end if;
  if existing.status = 'completed' then
    return query select existing.status, false, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;

  rewarded := coalesce(array(select jsonb_array_elements_text(coalesce(existing.verification_data -> 'stay_rewarded_steps', '[]'::jsonb))), '{}');
  fresh := array(select distinct s from unnest(coalesce(p_steps, '{}')) s where s in ('bot', 'app', 'push') and not (s = any(rewarded)));
  if coalesce(array_length(fresh, 1), 0) = 0 then raise exception 'No new steps done yet.' using errcode = 'P0001'; end if;

  per_step := round(challenge_row.core_reward_amount / 3, 2);
  reward := per_step * array_length(fresh, 1);
  rewarded := rewarded || fresh;
  all_done := (select count(distinct s) from unnest(rewarded) s where s in ('bot', 'app', 'push')) = 3;
  -- Not all steps yet: the task is put aside like a skipped one, so the path moves on; it can be taken again later.
  next_status := case when all_done then 'completed' else 'declined' end;

  update public.core_accounts set balance = balance + reward, updated_at = now() where user_id = p_user_id;
  if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  update public.user_challenges
  set status = next_status,
      core_reward_amount = coalesce(existing.core_reward_amount, 0) + reward,
      wallet_reward_amount = 0,
      reward_settled_at = case when all_done then now() else existing.reward_settled_at end,
      reward_idempotency_key = case when all_done then 'challenge:' || existing.id::text || ':reward' else existing.reward_idempotency_key end,
      updated_at = now(),
      verification_data = coalesce(verification_data, '{}'::jsonb) || jsonb_build_object('stay_rewarded_steps', to_jsonb(rewarded))
  where id = existing.id;
  return query select next_status, true, reward, 0::numeric;
end;
$$;

revoke all on function public.settle_stay_in_touch(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.settle_stay_in_touch(uuid, uuid, text[]) to service_role;

-- Founder decision 2026-10-29: in Russian it is «задание», not «квест». Russian texts of the other tasks follow.
create or replace function pg_temp.zadanie(value text) returns text language sql immutable as $f$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(value,
    'когда квест ждёт или открылся новый', 'когда задание ждёт или открылось новое'),
    'Пошаговый квест', 'Пошаговое задание'),
    'новый квест', 'новое задание'),
    'квеста «', 'задания «'),
    'квест «', 'задание «'),
    'квестами', 'заданиями'),
    'квестов', 'заданий'),
    'квесты', 'задания'),
    'квесте', 'задании'),
    'квест', 'задание')
$f$;

update public.challenges set title = jsonb_set(title, '{ru}', to_jsonb(pg_temp.zadanie(title->>'ru'))) where title->>'ru' ilike '%квест%';
update public.challenges set description = jsonb_set(description, '{ru}', to_jsonb(pg_temp.zadanie(description->>'ru'))) where description->>'ru' ilike '%квест%';
update public.challenges set instructions = jsonb_set(instructions, '{ru}', to_jsonb(pg_temp.zadanie(instructions->>'ru'))) where instructions->>'ru' ilike '%квест%';
update public.challenges set requirements = jsonb_set(requirements, '{ru}', to_jsonb(pg_temp.zadanie(requirements->>'ru'))) where requirements->>'ru' ilike '%квест%';

commit;
