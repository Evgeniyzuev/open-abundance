-- «Про изобилие» (founder decision 2026-10-29): path step before «Я не робот». Five questions on how money works
-- here (one right answer each, a lesson after a wrong one), a reel window with coins for first-try right answers,
-- five opinion questions on AI and the future. Reward: $1 Core × share of first-try right answers, graded on the
-- server (lib/abundanceQuiz.ts, app/api/challenges/progress) and paid by settle_abundance_quiz.
begin;

update public.challenges set path_order = path_order + 100 where path_order >= 10;

insert into public.challenges (
  id, title, description, instructions, requirements, category, difficulty_level, duration_days, image_url,
  verification_type, is_active, sort_order, verification_logic, track_key, track_step, action_view,
  is_permanent, core_reward_amount, wallet_reward_amount, activity_type, reward_mode, path_order, unlock_at_completed
) values (
  '0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a08',
  '{"ru": "Про изобилие", "en": "About abundance"}',
  '{"ru": "Десять коротких вопросов. Первые пять — как здесь зарабатывают и выводят деньги: за каждый верный ответ с первой попытки в Core выпадает $0.2. Остальные пять — что ты думаешь об ИИ и будущем, тут любой ответ верный.", "en": "Ten short questions. The first five are about how money is earned and withdrawn here: each answer right on the first try drops $0.2 into Core. The other five are about what you think of AI and the future; any answer is right there."}',
  '{"ru": "Отвечай на вопросы. Если ошибёшься, прочитай короткий урок и ответь ещё раз. В конце нажми «Забрать награду».", "en": "Answer the questions. If you get one wrong, read the short lesson and answer again. At the end tap Claim reward."}',
  '{"ru": "Ответы на все десять вопросов. Награда: $0.2 в Core за каждый из первых пяти ответов, верный с первой попытки.", "en": "Answers to all ten questions. Reward: $0.2 in Core for each of the first five answered right on the first try."}',
  'core_education', 1, 1, null,
  'auto', true, 46, 'abundance_quiz', null, null, null,
  false, 1.00, 0.00, 'mission', 'guaranteed', 10, 0
);

update public.challenges set path_order = path_order - 99 where path_order >= 110;

create or replace function public.settle_abundance_quiz(p_user_id uuid, p_challenge_id uuid)
returns table (challenge_status text, reward_claimed boolean, rewarded_core_amount numeric, rewarded_wallet_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges%rowtype;
  existing public.user_challenges%rowtype;
  right_answers int;
  reward numeric(30, 12);
begin
  select * into challenge_row from public.challenges where id = p_challenge_id and is_active = true and verification_logic = 'abundance_quiz';
  if not found then raise exception 'Active abundance quiz was not found.' using errcode = 'P0002'; end if;
  select * into existing from public.user_challenges where user_id = p_user_id and challenge_id = p_challenge_id for update;
  if not found then raise exception 'Take the task first.' using errcode = 'P0001'; end if;
  if existing.status = 'completed' then
    return query select existing.status, false, existing.core_reward_amount, existing.wallet_reward_amount;
    return;
  end if;
  if coalesce((existing.verification_data ->> 'abundance_quiz_done')::boolean, false) is not true then
    raise exception 'Answer all the questions first.' using errcode = 'P0001';
  end if;

  right_answers := greatest(0, least(5, coalesce((existing.verification_data ->> 'abundance_correct')::int, 0)));
  reward := round(challenge_row.core_reward_amount * right_answers / 5, 2);
  if reward > 0 then
    update public.core_accounts set balance = balance + reward, updated_at = now() where user_id = p_user_id;
    if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
  end if;
  update public.user_challenges
  set status = 'completed', core_reward_amount = reward, wallet_reward_amount = 0,
      reward_settled_at = now(), reward_idempotency_key = 'challenge:' || existing.id::text || ':reward', updated_at = now()
  where id = existing.id;
  return query select 'completed'::text, true, reward, 0::numeric;
end;
$$;

revoke all on function public.settle_abundance_quiz(uuid, uuid) from public, anon, authenticated;
grant execute on function public.settle_abundance_quiz(uuid, uuid) to service_role;

commit;
