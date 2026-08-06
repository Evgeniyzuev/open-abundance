-- Acquisition publication milestones, quality claims and persistent Peer reviews.
-- Publications and metrics are review tasks; the user accepts one permanent review challenge.

alter table public.challenges
  add column if not exists acquisition_series text,
  add column if not exists acquisition_target bigint,
  add column if not exists acquisition_metric_key text,
  add column if not exists reward_amount numeric(20, 2),
  add column if not exists reward_account text not null default 'core',
  add column if not exists is_permanent boolean not null default false,
  add column if not exists review_reward_amount numeric(20, 2);

create index if not exists challenges_acquisition_series_idx
on public.challenges (acquisition_series, acquisition_target)
where acquisition_series is not null;

create index if not exists challenges_permanent_idx
on public.challenges (is_permanent, is_active)
where is_permanent = true;

create table if not exists public.acquisition_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  submission_type text not null check (submission_type in ('publication', 'metric')),
  publication_submission_id uuid references public.acquisition_submissions(id) on delete restrict,
  canonical_url text,
  platform text,
  title text,
  body_excerpt text,
  cover_url text,
  referral_url text,
  metric_key text check (metric_key in ('views', 'reactions', 'comments')),
  metric_value bigint,
  metric_evidence_url text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'cancelled')),
  review_round integer not null default 1 check (review_round > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (
    (submission_type = 'publication' and publication_submission_id is null and canonical_url is not null and metric_key is null)
    or
    (submission_type = 'metric' and publication_submission_id is not null and canonical_url is null and metric_key is not null and metric_value is not null)
  ),
  unique (user_id, canonical_url)
);

create index if not exists acquisition_submissions_user_status_idx
on public.acquisition_submissions (user_id, status, created_at desc);

create index if not exists acquisition_submissions_publications_idx
on public.acquisition_submissions (user_id, submission_type, status, created_at desc);

create table if not exists public.peer_review_tasks (
  id uuid primary key default gen_random_uuid(),
  source_submission_id uuid not null unique references public.acquisition_submissions(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'in_review', 'settled', 'expired')),
  required_reviews integer not null default 3 check (required_reviews > 0),
  pass_threshold integer not null default 2 check (pass_threshold > 0 and pass_threshold <= required_reviews),
  due_at timestamptz not null default (now() + interval '24 hours'),
  final_verdict text check (final_verdict in ('pass', 'fail')),
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists peer_review_tasks_queue_idx
on public.peer_review_tasks (status, due_at, created_at);

create table if not exists public.peer_review_answers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.peer_review_tasks(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'submitted', 'settled')),
  declined_after_accept boolean not null default false,
  decline_reason text,
  verdict text check (verdict in ('pass', 'fail')),
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  quality_status text not null default 'pending' check (quality_status in ('pending', 'valid', 'invalid')),
  score_delta integer not null default 0,
  trust_penalty integer not null default 0,
  reward_status text not null default 'pending' check (reward_status in ('pending', 'paid', 'withheld')),
  reward_amount numeric(20, 2) not null default 0,
  offered_at timestamptz not null default now(),
  accepted_at timestamptz,
  submitted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, reviewer_user_id)
);

create index if not exists peer_review_answers_reviewer_idx
on public.peer_review_answers (reviewer_user_id, status, created_at desc);

create index if not exists peer_review_answers_task_idx
on public.peer_review_answers (task_id, status, created_at);

alter table public.acquisition_submissions enable row level security;
alter table public.peer_review_tasks enable row level security;
alter table public.peer_review_answers enable row level security;

revoke all on table public.acquisition_submissions, public.peer_review_tasks, public.peer_review_answers from public, anon, authenticated;
grant select on table public.acquisition_submissions, public.peer_review_tasks, public.peer_review_answers to authenticated;
grant all on table public.acquisition_submissions, public.peer_review_tasks, public.peer_review_answers to service_role;

drop policy if exists "Users read own acquisition submissions" on public.acquisition_submissions;
create policy "Users read own acquisition submissions"
on public.acquisition_submissions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Peer reviewers read source submissions" on public.acquisition_submissions;
create policy "Peer reviewers read source submissions"
on public.acquisition_submissions for select to authenticated
using (exists (
  select 1
  from public.peer_review_tasks task
  join public.peer_review_answers answer on answer.task_id = task.id
  where task.source_submission_id = acquisition_submissions.id
    and answer.reviewer_user_id = (select auth.uid())
));

drop policy if exists "Peer reviewers read own tasks" on public.peer_review_tasks;
create policy "Peer reviewers read own tasks"
on public.peer_review_tasks for select to authenticated
using (exists (
  select 1
  from public.peer_review_answers answer
  where answer.task_id = peer_review_tasks.id
    and answer.reviewer_user_id = (select auth.uid())
));

drop policy if exists "Peer reviewers read own answers" on public.peer_review_answers;
create policy "Peer reviewers read own answers"
on public.peer_review_answers for select to authenticated
using (reviewer_user_id = (select auth.uid()));

create or replace function public.settle_peer_review_answer(
  p_answer_id uuid,
  p_quality_status text,
  p_reason text default null
)
returns table (
  answer_id uuid,
  reviewer_user_id uuid,
  quality_status text,
  score_delta integer,
  trust_penalty integer,
  reward_status text,
  reward_amount numeric,
  review_score integer
)
language plpgsql security definer set search_path = public
as $$
declare
  answer_row public.peer_review_answers%rowtype;
  task_row public.peer_review_tasks%rowtype;
  challenge_row public.challenges%rowtype;
  progress_row public.user_challenges%rowtype;
  progress jsonb;
  current_score integer;
  next_reward_blocked boolean;
  reward numeric(20, 2);
  delta integer;
  penalty integer;
begin
  if p_quality_status not in ('valid', 'invalid') then
    raise exception 'Invalid peer review quality status.' using errcode = '22023';
  end if;

  select * into answer_row
  from public.peer_review_answers
  where id = p_answer_id
  for update;

  if answer_row.id is null then
    raise exception 'Peer review answer not found.' using errcode = 'P0002';
  end if;

  if answer_row.status <> 'submitted' then
    return query
    select answer_row.id, answer_row.reviewer_user_id, answer_row.quality_status,
      answer_row.score_delta, answer_row.trust_penalty, answer_row.reward_status,
      answer_row.reward_amount, 0;
    return;
  end if;

  select * into task_row
  from public.peer_review_tasks
  where id = answer_row.task_id;

  select c.* into challenge_row
  from public.challenges c
  join public.acquisition_submissions submission on submission.challenge_id = c.id
  where submission.id = task_row.source_submission_id;

  insert into public.user_challenges (user_id, challenge_id, status, verification_data, updated_at)
  values (answer_row.reviewer_user_id, '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21', 'accepted', '{}'::jsonb, now())
  on conflict (user_id, challenge_id) do nothing;

  select * into progress_row
  from public.user_challenges
  where user_id = answer_row.reviewer_user_id
    and challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21'
  for update;

  progress := coalesce(progress_row.verification_data, '{}'::jsonb);
  current_score := coalesce((progress->>'review_score')::integer, 0);
  next_reward_blocked := coalesce((progress->>'next_reward_blocked')::boolean, false);

  if p_quality_status = 'valid' then
    delta := 1;
    penalty := 0;
    if next_reward_blocked then
      reward := 0;
      next_reward_blocked := false;
    else
      reward := coalesce(challenge_row.review_reward_amount, 0.35);
    end if;
  else
    delta := -2;
    penalty := -1;
    reward := 0;
    next_reward_blocked := true;
  end if;

  current_score := current_score + delta;

  progress := jsonb_set(progress, '{review_score}', to_jsonb(current_score), true);
  progress := jsonb_set(progress, '{reviews_completed}', to_jsonb(coalesce((progress->>'reviews_completed')::integer, 0) + 1), true);
  if p_quality_status = 'valid' then
    progress := jsonb_set(progress, '{valid_reviews}', to_jsonb(coalesce((progress->>'valid_reviews')::integer, 0) + 1), true);
  else
    progress := jsonb_set(progress, '{invalid_reviews}', to_jsonb(coalesce((progress->>'invalid_reviews')::integer, 0) + 1), true);
  end if;
  progress := jsonb_set(progress, '{next_reward_blocked}', to_jsonb(next_reward_blocked), true);
  if p_reason is not null then
    progress := jsonb_set(progress, '{last_review_reason}', to_jsonb(p_reason), true);
  end if;

  if reward > 0 then
    update public.core_accounts
    set balance = balance + reward, updated_at = now()
    where user_id = answer_row.reviewer_user_id;
    progress := jsonb_set(progress, '{rewards_claimed}', to_jsonb(coalesce((progress->>'rewards_claimed')::integer, 0) + 1), true);
    progress := jsonb_set(progress, '{last_reward_at}', to_jsonb(now()), true);
  end if;

  update public.user_challenges
  set verification_data = progress, updated_at = now()
  where user_id = answer_row.reviewer_user_id
    and challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21';

  update public.peer_review_answers
  set status = 'settled',
      quality_status = p_quality_status,
      score_delta = delta,
      trust_penalty = penalty,
      reward_status = case when reward > 0 then 'paid' else 'withheld' end,
      reward_amount = reward,
      notes = case when p_reason is null then notes else coalesce(notes, '') || case when notes is null or notes = '' then '' else E'\n' end || 'Audit: ' || p_reason end,
      settled_at = now(),
      updated_at = now()
  where id = answer_row.id;

  return query
  select answer_row.id, answer_row.reviewer_user_id, p_quality_status, delta, penalty,
    case when reward > 0 then 'paid' else 'withheld' end, reward, current_score;
end;
$$;

revoke all on function public.settle_peer_review_answer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.settle_peer_review_answer(uuid, text, text) to service_role;
insert into public.challenges (
  id, title, description, instructions, requirements, reward_label, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, acquisition_series, acquisition_target, acquisition_metric_key, reward_amount, reward_account
) values
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f01',
 '{"ru":"Первая внешняя публикация","en":"First external publication"}',
 '{"ru":"Размести первый полезный материал с визуальной обложкой и своей ссылкой Open Abundance.","en":"Publish your first useful visual piece with your Open Abundance link."}',
 '{"ru":"Выбери разрешённую площадку, добавь честный заголовок, обложку или превью, личный контекст и referral-ссылку. В челлендже показана актуальная матрица площадок.","en":"Choose an allowed platform, add an honest title, cover or preview, personal context and your referral link. The challenge shows the current platform matrix."}',
 '{"ru":"1 одобренная внешняя публикация.","en":"1 approved external publication."}',
 '{"ru":"Core +1$","en":"Core +1$"}', 'social', 1, 1, 'community', 'acquisition_publications_milestone', 200, 'acquisition_publications', 1, null, 'people.blog', 'acquisition_publications', 1, 'publication_count', 1, 'core'),
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f02',
 '{"ru":"Три внешние публикации","en":"Three external publications"}',
 '{"ru":"Собери серию из трёх одобренных публикаций на подходящих площадках.","en":"Build a series of three approved publications on suitable platforms."}',
 '{"ru":"Продолжай серию. Каждая публикация должна иметь свою страницу, адаптированный текст и визуальную обложку.","en":"Continue the series. Each publication needs its own page, adapted text and visual cover."}',
 '{"ru":"Заверши предыдущий milestone и набери 3 одобренные публикации.","en":"Complete the previous milestone and reach 3 approved publications."}',
 '{"ru":"Core +1$","en":"Core +1$"}', 'social', 2, 7, 'community', 'acquisition_publications_milestone', 201, 'acquisition_publications', 2, '55bb0d7b-ef78-46f8-9c02-c8ba42d01f01', 'people.blog', 'acquisition_publications', 3, 'publication_count', 1, 'core'),
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f03',
 '{"ru":"Шесть внешних публикаций","en":"Six external publications"}',
 '{"ru":"Поддерживай регулярное распространение и собери шесть одобренных материалов.","en":"Keep distributing consistently and reach six approved pieces."}',
 '{"ru":"Адаптируй подачу под разные площадки, сохраняй визуальное качество и не дублируй материал без изменений.","en":"Adapt the message to different platforms, preserve visual quality and do not duplicate unchanged material."}',
 '{"ru":"Заверши предыдущий milestone и набери 6 одобренных публикаций.","en":"Complete the previous milestone and reach 6 approved publications."}',
 '{"ru":"Core +2$","en":"Core +2$"}', 'social', 3, 14, 'community', 'acquisition_publications_milestone', 202, 'acquisition_publications', 3, '55bb0d7b-ef78-46f8-9c02-c8ba42d01f02', 'people.blog', 'acquisition_publications', 6, 'publication_count', 2, 'core'),
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f04',
 '{"ru":"Двенадцать внешних публикаций","en":"Twelve external publications"}',
 '{"ru":"Сформируй устойчивый внешний канал и собери двенадцать одобренных материалов.","en":"Build a sustained external channel and reach twelve approved pieces."}',
 '{"ru":"Соблюдай недельный ритм, обновляй обложки и сравнивай, какие темы приводят людей в приложение.","en":"Keep a weekly rhythm, refresh covers and compare which topics bring people to the app."}',
 '{"ru":"Заверши предыдущий milestone и набери 12 одобренных публикаций.","en":"Complete the previous milestone and reach 12 approved publications."}',
 '{"ru":"Core +3$","en":"Core +3$"}', 'social', 4, 30, 'community', 'acquisition_publications_milestone', 203, 'acquisition_publications', 4, '55bb0d7b-ef78-46f8-9c02-c8ba42d01f03', 'people.blog', 'acquisition_publications', 12, 'publication_count', 3, 'core'),
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f11',
 '{"ru":"1 000 просмотров","en":"1,000 views"}',
 '{"ru":"Доведи одну одобренную публикацию до 1 000 органических просмотров.","en":"Bring one approved publication to 1,000 organic views."}',
 '{"ru":"Выбери одобренный материал, приложи публичный счётчик или короткое видео нативной аналитики площадки. Покупка просмотров запрещена.","en":"Choose an approved piece and attach a public counter or a short recording of the platform analytics. Bought views are not allowed."}',
 '{"ru":"1 000 просмотров на одной одобренной публикации.","en":"1,000 views on one approved publication."}',
 '{"ru":"Core +1$","en":"Core +1$"}', 'social', 2, 30, 'community', 'acquisition_metric_views', 210, 'acquisition_quality_views', 1, null, 'people.blog', 'acquisition_quality_views', 1, 'views', 1000, 1, 'core'),
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f12',
 '{"ru":"100 реакций","en":"100 reactions"}',
 '{"ru":"Получи 100 органических реакций на одну одобренную публикацию.","en":"Earn 100 organic reactions on one approved publication."}',
 '{"ru":"Приложи публичный счётчик реакций. Не используй ботов, покупку активности или взаимные накрутки.","en":"Attach a public reaction counter. Do not use bots, bought activity or engagement rings."}',
 '{"ru":"100 реакций на одной одобренной публикации.","en":"100 reactions on one approved publication."}',
 '{"ru":"Core +1$","en":"Core +1$"}', 'social', 2, 30, 'community', 'acquisition_metric_reactions', 211, 'acquisition_quality_reactions', 1, null, 'people.blog', 'acquisition_quality_reactions', 1, 'reactions', 100, 1, 'core'),
('55bb0d7b-ef78-46f8-9c02-c8ba42d01f13',
 '{"ru":"10 содержательных комментариев","en":"10 meaningful comments"}',
 '{"ru":"Собери 10 содержательных комментариев от разных людей под одной публикацией.","en":"Collect 10 meaningful comments from different people under one publication."}',
 '{"ru":"Покажи публичную страницу с комментариями. Emoji-only, ответы автора и спам не считаются.","en":"Show the public comment page. Emoji-only comments, author replies and spam do not count."}',
 '{"ru":"10 содержательных комментариев от разных аккаунтов.","en":"10 meaningful comments from different accounts."}',
 '{"ru":"Core +1$","en":"Core +1$"}', 'social', 2, 30, 'community', 'acquisition_metric_comments', 212, 'acquisition_quality_comments', 1, null, 'people.blog', 'acquisition_quality_comments', 1, 'comments', 10, 1, 'core')
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  requirements = excluded.requirements,
  reward_label = excluded.reward_label,
  category = excluded.category,
  difficulty_level = excluded.difficulty_level,
  duration_days = excluded.duration_days,
  verification_type = excluded.verification_type,
  verification_logic = excluded.verification_logic,
  sort_order = excluded.sort_order,
  track_key = excluded.track_key,
  track_step = excluded.track_step,
  prerequisite_challenge_id = excluded.prerequisite_challenge_id,
  action_view = excluded.action_view,
  acquisition_series = excluded.acquisition_series,
  acquisition_target = excluded.acquisition_target,
  acquisition_metric_key = excluded.acquisition_metric_key,
  reward_amount = excluded.reward_amount,
  reward_account = excluded.reward_account,
  is_active = true;

update public.challenges
set prerequisite_challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f01'
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f02';

update public.challenges
set prerequisite_challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f02'
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f03';

update public.challenges
set prerequisite_challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f03'
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f04';

update public.challenges
set reward_amount = case
  when id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f01' then 1
  when id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f02' then 1
  when id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f03' then 2
  when id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f04' then 3
  when id in ('55bb0d7b-ef78-46f8-9c02-c8ba42d01f11', '55bb0d7b-ef78-46f8-9c02-c8ba42d01f12', '55bb0d7b-ef78-46f8-9c02-c8ba42d01f13') then 1
  else reward_amount
end
where id in (
  '55bb0d7b-ef78-46f8-9c02-c8ba42d01f01', '55bb0d7b-ef78-46f8-9c02-c8ba42d01f02',
  '55bb0d7b-ef78-46f8-9c02-c8ba42d01f03', '55bb0d7b-ef78-46f8-9c02-c8ba42d01f04',
  '55bb0d7b-ef78-46f8-9c02-c8ba42d01f11', '55bb0d7b-ef78-46f8-9c02-c8ba42d01f12',
  '55bb0d7b-ef78-46f8-9c02-c8ba42d01f13'
);

create or replace function public.audit_peer_review_answer(
  p_answer_id uuid,
  p_quality_status text,
  p_reason text default null
)
returns table (
  answer_id uuid,
  reviewer_user_id uuid,
  quality_status text,
  score_delta integer,
  trust_penalty integer,
  reward_status text,
  reward_amount numeric
)
language plpgsql security definer set search_path = public
as $$
declare
  answer_row public.peer_review_answers%rowtype;
  progress_row public.user_challenges%rowtype;
  progress jsonb;
  current_score integer;
  refund numeric(20, 2);
begin
  if p_quality_status not in ('valid', 'invalid') then
    raise exception 'Invalid peer review quality status.' using errcode = '22023';
  end if;

  select * into answer_row
  from public.peer_review_answers
  where id = p_answer_id
  for update;

  if answer_row.id is null then
    raise exception 'Peer review answer not found.' using errcode = 'P0002';
  end if;

  if answer_row.status <> 'settled' or answer_row.quality_status = p_quality_status then
    return query
    select answer_row.id, answer_row.reviewer_user_id, answer_row.quality_status,
      answer_row.score_delta, answer_row.trust_penalty, answer_row.reward_status,
      answer_row.reward_amount;
    return;
  end if;

  select * into progress_row
  from public.user_challenges
  where user_id = answer_row.reviewer_user_id
    and challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21'
  for update;

  progress := coalesce(progress_row.verification_data, '{}'::jsonb);
  current_score := coalesce((progress->>'review_score')::integer, 0);

  if p_quality_status = 'invalid' and answer_row.quality_status = 'valid' then
    refund := greatest(0, answer_row.reward_amount);
    if refund > 0 then
      update public.core_accounts
      set balance = greatest(0, balance - refund), updated_at = now()
      where user_id = answer_row.reviewer_user_id;
    end if;

    current_score := current_score - 3;
    progress := jsonb_set(progress, '{review_score}', to_jsonb(current_score), true);
    progress := jsonb_set(progress, '{invalid_reviews}', to_jsonb(coalesce((progress->>'invalid_reviews')::integer, 0) + 1), true);
    progress := jsonb_set(progress, '{next_reward_blocked}', 'true'::jsonb, true);
    if p_reason is not null then
      progress := jsonb_set(progress, '{last_review_reason}', to_jsonb(p_reason), true);
    end if;

    update public.user_challenges
    set verification_data = progress, updated_at = now()
    where user_id = answer_row.reviewer_user_id
      and challenge_id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21';

    update public.peer_review_answers
    set quality_status = 'invalid',
        score_delta = -2,
        trust_penalty = -1,
        reward_status = 'withheld',
        reward_amount = 0,
        notes = coalesce(notes, '') || case when p_reason is null then '' else case when notes is null or notes = '' then '' else E'\n' end || 'Audit: ' || p_reason end,
        updated_at = now()
    where id = answer_row.id;

    return query
    select answer_row.id, answer_row.reviewer_user_id, 'invalid'::text, -2, -1, 'withheld'::text, 0::numeric;
    return;
  end if;

  return query
  select answer_row.id, answer_row.reviewer_user_id, answer_row.quality_status,
    answer_row.score_delta, answer_row.trust_penalty, answer_row.reward_status,
    answer_row.reward_amount;
end;
$$;

revoke all on function public.audit_peer_review_answer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.audit_peer_review_answer(uuid, text, text) to service_role;
-- One persistent reviewer challenge. It never moves to the completed archive.
insert into public.challenges (
  id, title, description, instructions, requirements, reward_label, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, reward_amount, reward_account, is_permanent, review_reward_amount, is_active
) values (
  '55bb0d7b-ef78-46f8-9c02-c8ba42d01f21',
  '{"ru":"Peer reviews","en":"Peer reviews"}',
  '{"ru":"Проверяй публикации других участников по одному заданию и получай Core за качественный ответ.","en":"Review one participant publication at a time and earn Core for a careful answer."}',
  '{"ru":"Возьми или отклони предложенное задание. Для принятого задания отметь каждый пункт чек-листа, выбери итог и добавь короткое объяснение. За подтверждённую ложную проверку Trust будет снижен в следующей версии рейтинга.","en":"Take or decline the offered task. For an accepted task, complete every checklist item, choose a verdict and add a short explanation. Confirmed false reviews will reduce Trust in the next rating version."}',
  '{"ru":"Постоянный челлендж: одно задание за раз, +0,35$ Core за принятую проверку.","en":"Permanent challenge: one task at a time, +$0.35 Core for an accepted review."}',
  '{"ru":"Core +0,35$ за проверку","en":"Core +$0.35 per review"}',
  'social', 1, null, 'community', 'peer_reviews', 190, 'people.blog', 0.35, 'core', true, 0.35, true
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  requirements = excluded.requirements,
  reward_label = excluded.reward_label,
  category = excluded.category,
  difficulty_level = excluded.difficulty_level,
  duration_days = excluded.duration_days,
  verification_type = excluded.verification_type,
  verification_logic = excluded.verification_logic,
  sort_order = excluded.sort_order,
  action_view = excluded.action_view,
  reward_amount = excluded.reward_amount,
  reward_account = excluded.reward_account,
  is_permanent = true,
  review_reward_amount = excluded.review_reward_amount,
  is_active = true;