-- First challenge checked by AI: an essay "The future with AI". The person answers in the challenge card; with
-- consent the answer is published as a comment in a public discussion thread, where members vote on comments
-- (Reddit-style up/down). The AI reviewer (Claude after the daily analytics run, or the operator) scores it 0-100.
-- Reward = base * score%, split by the founder's rule (2026-10-23): the first 80 points go to Core, points above
-- 80 go to Wallet. Base = challenges.core_reward_amount + wallet_reward_amount (stored as the 100% split 1.6 + 0.4).
-- A score under 30 pays nothing and returns the answer for rework.

-- 1. Longer comments, so a full answer fits in the thread.
alter table public.feed_post_comments drop constraint if exists feed_post_comments_body_check;
alter table public.feed_post_comments add constraint feed_post_comments_body_check check (char_length(btrim(body)) between 1 and 4000);

-- 2. Up/down votes on comments. Read and written only through the API (service role).
create table if not exists public.feed_comment_votes (
  comment_id uuid not null references public.feed_post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists feed_comment_votes_comment_idx on public.feed_comment_votes (comment_id);
alter table public.feed_comment_votes enable row level security;
revoke all on public.feed_comment_votes from public, anon, authenticated;
grant select, insert, update, delete on public.feed_comment_votes to service_role;

-- 3. Essay answers and their AI review.
create table if not exists public.challenge_essay_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 500 and 4000),
  publish_consent boolean not null default false,
  feed_comment_id uuid references public.feed_post_comments(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'needs_work', 'scored')),
  score smallint check (score is null or score between 0 and 100),
  scores jsonb not null default '{}'::jsonb,
  feedback text check (feedback is null or char_length(feedback) <= 1500),
  reviewer text check (reviewer is null or reviewer in ('claude', 'operator')),
  reviewed_at timestamptz,
  core_reward_amount numeric(18, 2) not null default 0,
  wallet_reward_amount numeric(18, 2) not null default 0,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);
create index if not exists challenge_essay_submissions_pending_idx on public.challenge_essay_submissions (submitted_at) where status = 'submitted';
alter table public.challenge_essay_submissions enable row level security;
revoke all on public.challenge_essay_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.challenge_essay_submissions to service_role;

-- 4. Scoring and payout in one transaction. Idempotent: only a 'submitted' answer is scored.
create or replace function public.review_challenge_essay(
  p_submission_id uuid,
  p_score integer,
  p_scores jsonb,
  p_feedback text,
  p_reviewer text
)
returns table (result_status text, result_core numeric, result_wallet numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.challenge_essay_submissions%rowtype;
  challenge_row public.challenges%rowtype;
  progress public.user_challenges%rowtype;
  wallet public.wallet_accounts%rowtype;
  base_amount numeric;
  core_amount numeric;
  wallet_amount numeric;
  next_wallet_balance numeric(30, 12);
  reward_key text;
begin
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Score must be between 0 and 100.' using errcode = '22023';
  end if;

  select * into submission from public.challenge_essay_submissions where id = p_submission_id for update;
  if not found then raise exception 'Essay submission was not found.' using errcode = 'P0002'; end if;
  if submission.status <> 'submitted' then
    return query select submission.status, submission.core_reward_amount, submission.wallet_reward_amount;
    return;
  end if;

  if p_score < 30 then
    update public.challenge_essay_submissions
    set status = 'needs_work', score = p_score, scores = coalesce(p_scores, '{}'::jsonb), feedback = p_feedback,
        reviewer = p_reviewer, reviewed_at = now(), updated_at = now()
    where id = submission.id;
    return query select 'needs_work'::text, 0::numeric, 0::numeric;
    return;
  end if;

  select * into challenge_row from public.challenges where id = submission.challenge_id;
  base_amount := challenge_row.core_reward_amount + challenge_row.wallet_reward_amount;
  core_amount := round(base_amount * least(p_score, 80) / 100.0, 2);
  wallet_amount := round(base_amount * greatest(p_score - 80, 0) / 100.0, 2);

  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (submission.user_id, submission.challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update set updated_at = now();
  select * into progress from public.user_challenges
  where user_id = submission.user_id and challenge_id = submission.challenge_id for update;

  if progress.status = 'completed' then
    core_amount := 0;
    wallet_amount := 0;
  else
    reward_key := 'challenge:' || progress.id::text || ':reward';
    if core_amount > 0 then
      update public.core_accounts set balance = balance + core_amount, updated_at = now() where user_id = submission.user_id;
      if not found then raise exception 'Core account is not created yet.' using errcode = 'P0002'; end if;
    end if;
    if wallet_amount > 0 then
      select * into wallet from public.wallet_accounts where user_id = submission.user_id for update;
      if not found then raise exception 'Wallet is not created yet.' using errcode = 'P0002'; end if;
      next_wallet_balance := wallet.balance + wallet_amount;
      update public.wallet_accounts set balance = next_wallet_balance, updated_at = now() where user_id = submission.user_id;
      insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
      values (submission.user_id, 'credit', wallet_amount, wallet.currency_code, 'challenge_reward', 'challenge', progress.id, next_wallet_balance,
              reward_key || ':wallet', jsonb_build_object('challenge_id', submission.challenge_id, 'score', p_score))
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
    update public.user_challenges
    set status = 'completed', core_reward_amount = core_amount, wallet_reward_amount = wallet_amount,
        reward_settled_at = now(), reward_idempotency_key = reward_key, updated_at = now()
    where id = progress.id;
  end if;

  update public.challenge_essay_submissions
  set status = 'scored', score = p_score, scores = coalesce(p_scores, '{}'::jsonb), feedback = p_feedback, reviewer = p_reviewer,
      reviewed_at = now(), core_reward_amount = core_amount, wallet_reward_amount = wallet_amount, updated_at = now()
  where id = submission.id;
  return query select 'scored'::text, core_amount, wallet_amount;
end;
$$;

revoke all on function public.review_challenge_essay(uuid, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.review_challenge_essay(uuid, integer, jsonb, text, text) to service_role;

-- 5. Public discussion thread for the answers.
insert into public.feed_posts (id, author_user_id, source_key, author_label, post_type, status, visibility, body, system_verified, created_at, published_at)
values (
  'a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e01', null, 'challenge:ai_future', 'Open Abundance', 'manual', 'published', 'public',
  'Будущее с ИИ: каким оно будет и какое выбираете вы? Ответы участников челленджа — в комментариях. Голосуйте ▲▼ за самые сильные.',
  false, now(), now()
)
on conflict (id) do update set body = excluded.body, status = excluded.status, visibility = excluded.visibility, author_label = excluded.author_label;

insert into public.feed_post_translations (post_id, locale, author_name, body) values
  ('a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e01', 'ru', 'Open Abundance', 'Будущее с ИИ: каким оно будет и какое выбираете вы? Ответы участников челленджа — в комментариях. Голосуйте ▲▼ за самые сильные.'),
  ('a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e01', 'en', 'Open Abundance', 'The future with AI: what will it be, and which one do you choose? Challenge answers are in the comments. Vote ▲▼ for the strongest ones.')
on conflict (post_id, locale) do update set author_name = excluded.author_name, body = excluded.body;

-- 6. The challenge.
insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values (
  'a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e02',
  '{"ru": "Будущее с ИИ: ваш взгляд", "en": "The future with AI: your view"}'::jsonb,
  '{"ru": "Ответьте на вопросы о будущем с ИИ. Ответ оценивает ИИ от 0 до 100%: награда = базовая × оценка.", "en": "Answer questions about the future with AI. AI scores the answer from 0 to 100%: reward = base × score."}'::jsonb,
  '{"ru": "Урок: будущее с ИИ не случится само, его выбирают люди и договоры между ними. Напишите своими словами, без готовых текстов.\n1. Как ИИ изменит общество через 1, 5, 10 и 20 лет? Станет ли больше товаров, услуг, строительства?\n2. Кому должен подчиняться ИИ: политику, миллиардеру, кому-то ещё — или собственным договорам с людьми? Почему?\n3. Каким вы видите лучшее будущее для себя и какое выбираете уже сегодня?\n4. Если экономика ИИ скоро взлетит, что вы сделаете сейчас, чтобы занять в ней место получше?\n5. Отправьте ответ. По желанию опубликуйте его в обсуждении: участники голосуют за сильные ответы.\nКак оценивает ИИ: соответствие вопросам, подробность и доводы, личный вклад и конкретные шаги, новизна идей, ясность. Оценка не зависит от того, какую позицию вы выбрали. До 80% — награда в Core, баллы выше 80 — в Wallet. Ниже 30% ответ возвращается на доработку.", "en": "Lesson: the future with AI will not just happen; people and their agreements choose it. Write in your own words, no ready-made texts.\n1. How will AI change society in 1, 5, 10 and 20 years? Will there be more goods, services, construction?\n2. Whom should AI obey: a politician, a billionaire, someone else, or its own agreements with people? Why?\n3. What best future do you see for yourself, and which one are you choosing today?\n4. If the AI economy takes off soon, what will you do now to take a better place in it?\n5. Submit your answer. Optionally publish it in the discussion, where members vote for strong answers.\nHow AI scores: relevance to the questions, detail and reasoning, personal contribution and concrete steps, novelty, clarity. The score does not depend on which position you take. Up to 80% is paid in Core, points above 80 go to Wallet. Below 30% the answer comes back for rework."}'::jsonb,
  '{"ru": "Ответ от 500 до 4000 знаков отправлен и оценён ИИ не ниже 30%.", "en": "An answer of 500 to 4000 characters is submitted and scored by AI at 30% or more."}'::jsonb,
  'growth', 2, 14, 'manual', 'ai_essay_review',
  70, null, null, null,
  null, 1.6, 0.4, true
)
on conflict (id) do update
set title = excluded.title, description = excluded.description, instructions = excluded.instructions, requirements = excluded.requirements,
    category = excluded.category, difficulty_level = excluded.difficulty_level, duration_days = excluded.duration_days,
    verification_type = excluded.verification_type, verification_logic = excluded.verification_logic, sort_order = excluded.sort_order,
    action_view = excluded.action_view, core_reward_amount = excluded.core_reward_amount, wallet_reward_amount = excluded.wallet_reward_amount,
    is_active = excluded.is_active;
