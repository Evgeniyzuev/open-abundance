-- Skill Passport foundation and the first software_creation L1 vertical slice.
-- Verdicts and evidence deliberately stay outside Core, Wallet and Trust ledgers.

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z][a-z0-9_]{2,63}$'),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  learning_path jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_level_rules (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  level integer not null check (level between 0 and 20),
  requirements jsonb not null default '{}'::jsonb,
  rubric jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (skill_id, level)
);

create table if not exists public.user_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  earned_skill_level integer not null default 0 check (earned_skill_level between 0 and 20),
  effective_skill_level integer not null default 0 check (effective_skill_level between 0 and 20),
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id),
  check (effective_skill_level <= earned_skill_level)
);

create table if not exists public.skill_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  target_level integer not null check (target_level between 1 and 20),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'rework', 'accepted')),
  attempt integer not null default 1 check (attempt > 0),
  latest_evidence_version integer not null default 0 check (latest_evidence_version >= 0),
  rework_reason text,
  submitted_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_id)
);

create table if not exists public.skill_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.skill_submissions(id) on delete cascade,
  version integer not null check (version > 0),
  deliverable_title text not null check (char_length(btrim(deliverable_title)) between 3 and 160),
  deliverable_description text not null check (char_length(btrim(deliverable_description)) between 10 and 4000),
  acceptance_criteria text not null check (char_length(btrim(acceptance_criteria)) between 3 and 2000),
  repo_url text not null check (char_length(btrim(repo_url)) between 8 and 2048),
  proof_url text not null check (char_length(btrim(proof_url)) between 8 and 2048),
  test_scenario text not null check (char_length(btrim(test_scenario)) between 10 and 3000),
  limitations text not null check (char_length(btrim(limitations)) between 3 and 2000),
  content_hash text not null check (char_length(content_hash) = 32),
  created_at timestamptz not null default now(),
  unique (submission_id, version)
);

create table if not exists public.skill_review_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.skill_submissions(id) on delete cascade,
  evidence_id uuid not null references public.skill_evidence(id) on delete restrict,
  slot_no integer not null check (slot_no between 1 and 3),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'assigned', 'decided', 'superseded')),
  claimed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (evidence_id, slot_no)
);

create table if not exists public.skill_review_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.skill_review_requests(id) on delete restrict,
  evidence_id uuid not null references public.skill_evidence(id) on delete restrict,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  verdict text not null check (verdict in ('pass', 'rework')),
  reproducibility boolean not null,
  criteria_met boolean not null,
  proof_sufficient boolean not null,
  safety boolean not null,
  critical_issue boolean not null default false,
  recommendation text not null check (char_length(btrim(recommendation)) between 3 and 2000),
  comment text not null check (char_length(btrim(comment)) between 3 and 3000),
  created_at timestamptz not null default now(),
  unique (request_id)
);

create table if not exists public.skill_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  submission_id uuid references public.skill_submissions(id) on delete set null,
  event_type text not null check (event_type in ('submission_created', 'review_requested', 'rework_requested', 'skill_accepted')),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists skills_active_idx on public.skills (is_active, slug);
create index if not exists skill_level_rules_skill_level_idx on public.skill_level_rules (skill_id, level);
create index if not exists user_skills_skill_level_idx on public.user_skills (skill_id, earned_skill_level desc);
create index if not exists skill_submissions_user_status_idx on public.skill_submissions (user_id, status, updated_at desc);
create index if not exists skill_evidence_submission_version_idx on public.skill_evidence (submission_id, version desc);
create index if not exists skill_review_requests_open_idx on public.skill_review_requests (status, created_at asc) where status = 'open';
create index if not exists skill_review_requests_reviewer_idx on public.skill_review_requests (reviewer_user_id, status, created_at desc);
create index if not exists skill_review_decisions_evidence_idx on public.skill_review_decisions (evidence_id, created_at desc);
create index if not exists skill_progress_events_user_created_idx on public.skill_progress_events (user_id, created_at desc);

alter table public.skills enable row level security;
alter table public.skill_level_rules enable row level security;
alter table public.user_skills enable row level security;
alter table public.skill_submissions enable row level security;
alter table public.skill_evidence enable row level security;
alter table public.skill_review_requests enable row level security;
alter table public.skill_review_decisions enable row level security;
alter table public.skill_progress_events enable row level security;

grant select on table public.skills, public.skill_level_rules to authenticated;
grant select on table public.user_skills, public.skill_submissions, public.skill_evidence, public.skill_review_requests, public.skill_review_decisions to authenticated;
grant all on table public.skills, public.skill_level_rules, public.user_skills, public.skill_submissions, public.skill_evidence, public.skill_review_requests, public.skill_review_decisions, public.skill_progress_events to service_role;

drop policy if exists "Authenticated users can read active skills" on public.skills;
create policy "Authenticated users can read active skills"
on public.skills for select to authenticated using (is_active);

drop policy if exists "Authenticated users can read skill rules" on public.skill_level_rules;
create policy "Authenticated users can read skill rules"
on public.skill_level_rules for select to authenticated
using (exists (select 1 from public.skills where skills.id = skill_level_rules.skill_id and skills.is_active));

drop policy if exists "Users can read own skill levels" on public.user_skills;
create policy "Users can read own skill levels"
on public.user_skills for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can read own skill submissions" on public.skill_submissions;
create policy "Users can read own skill submissions"
on public.skill_submissions for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.skill_review_requests request
    where request.submission_id = skill_submissions.id
      and request.reviewer_user_id = (select auth.uid())
  )
);

drop policy if exists "Owners and reviewers can read skill evidence" on public.skill_evidence;
create policy "Owners and reviewers can read skill evidence"
on public.skill_evidence for select to authenticated
using (
  exists (select 1 from public.skill_submissions submission where submission.id = skill_evidence.submission_id and submission.user_id = (select auth.uid()))
  or exists (select 1 from public.skill_review_requests request where request.evidence_id = skill_evidence.id and request.reviewer_user_id = (select auth.uid()))
);

drop policy if exists "Owners and reviewers can read skill review requests" on public.skill_review_requests;
create policy "Owners and reviewers can read skill review requests"
on public.skill_review_requests for select to authenticated
using (
  reviewer_user_id = (select auth.uid())
  or exists (select 1 from public.skill_submissions submission where submission.id = skill_review_requests.submission_id and submission.user_id = (select auth.uid()))
);

drop policy if exists "Owners and reviewers can read skill decisions" on public.skill_review_decisions;
create policy "Owners and reviewers can read skill decisions"
on public.skill_review_decisions for select to authenticated
using (
  reviewer_user_id = (select auth.uid())
  or exists (
    select 1
    from public.skill_review_requests request
    join public.skill_submissions submission on submission.id = request.submission_id
    where request.id = skill_review_decisions.request_id and submission.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read own skill progress events" on public.skill_progress_events;
create policy "Users can read own skill progress events"
on public.skill_progress_events for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.protect_skill_immutable_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Skill evidence and review decisions are immutable.' using errcode = '55000';
end;
$$;

drop trigger if exists protect_skill_evidence_immutable on public.skill_evidence;
create trigger protect_skill_evidence_immutable
before update or delete on public.skill_evidence
for each row execute function public.protect_skill_immutable_rows();

drop trigger if exists protect_skill_review_decisions_immutable on public.skill_review_decisions;
create trigger protect_skill_review_decisions_immutable
before update or delete on public.skill_review_decisions
for each row execute function public.protect_skill_immutable_rows();

create or replace function public.submit_skill_evidence(
  p_user_id uuid,
  p_skill_slug text,
  p_deliverable_title text,
  p_deliverable_description text,
  p_acceptance_criteria text,
  p_repo_url text,
  p_proof_url text,
  p_test_scenario text,
  p_limitations text,
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  skill_row record;
  submission_row record;
  evidence_row record;
  next_version integer;
  next_status text;
  hash_value text;
begin
  select id into skill_row
  from public.skills
  where slug = p_skill_slug and is_active;
  if not found then raise exception 'Skill is not available.' using errcode = '22023'; end if;

  select * into submission_row
  from public.skill_submissions
  where user_id = p_user_id and skill_id = skill_row.id
  for update;

  if found and submission_row.status = 'accepted' then
    raise exception 'This skill level is already accepted.' using errcode = '55000';
  end if;

  if not found then
    insert into public.skill_submissions (user_id, skill_id, target_level, status)
    values (p_user_id, skill_row.id, 1, 'draft')
    returning * into submission_row;
  else
    update public.skill_submissions
    set attempt = attempt + 1,
        updated_at = now()
    where id = submission_row.id
    returning * into submission_row;
  end if;

  next_version := submission_row.latest_evidence_version + 1;
  hash_value := md5(concat_ws('|',
    btrim(p_deliverable_title), btrim(p_deliverable_description), btrim(p_acceptance_criteria),
    btrim(p_repo_url), btrim(p_proof_url), btrim(p_test_scenario), btrim(p_limitations)
  ));

  insert into public.skill_evidence (
    submission_id, version, deliverable_title, deliverable_description, acceptance_criteria,
    repo_url, proof_url, test_scenario, limitations, content_hash
  ) values (
    submission_row.id, next_version, btrim(p_deliverable_title), btrim(p_deliverable_description), btrim(p_acceptance_criteria),
    btrim(p_repo_url), btrim(p_proof_url), btrim(p_test_scenario), btrim(p_limitations), hash_value
  ) returning * into evidence_row;

  next_status := case when p_submit then 'in_review' else 'draft' end;
  update public.skill_submissions
  set latest_evidence_version = next_version,
      status = next_status,
      rework_reason = null,
      submitted_at = case when p_submit then now() else submitted_at end,
      updated_at = now()
  where id = submission_row.id;

  if p_submit then
    update public.skill_review_requests
    set status = 'superseded'
    where submission_id = submission_row.id and evidence_id <> evidence_row.id and status in ('open', 'assigned');

    insert into public.skill_review_requests (submission_id, evidence_id, slot_no)
    values (submission_row.id, evidence_row.id, 1), (submission_row.id, evidence_row.id, 2), (submission_row.id, evidence_row.id, 3);

    insert into public.skill_progress_events (user_id, skill_id, submission_id, event_type, idempotency_key, metadata)
    values (
      p_user_id, skill_row.id, submission_row.id, 'review_requested',
      'review_requested:' || evidence_row.id::text,
      jsonb_build_object('evidence_version', next_version, 'target_level', 1)
    ) on conflict (user_id, idempotency_key) do nothing;
  else
    insert into public.skill_progress_events (user_id, skill_id, submission_id, event_type, idempotency_key, metadata)
    values (
      p_user_id, skill_row.id, submission_row.id, 'submission_created',
      'submission_created:' || evidence_row.id::text,
      jsonb_build_object('evidence_version', next_version, 'target_level', 1)
    ) on conflict (user_id, idempotency_key) do nothing;
  end if;

  return jsonb_build_object(
    'submission_id', submission_row.id,
    'evidence_id', evidence_row.id,
    'evidence_version', next_version,
    'status', next_status,
    'attempt', submission_row.attempt,
    'content_hash', hash_value
  );
end;
$$;

create or replace function public.claim_skill_review_request(
  p_request_id uuid,
  p_reviewer_user_id uuid,
  p_bootstrap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row record;
  eligible boolean;
begin
  select request.id, request.status, request.reviewer_user_id, submission.user_id as owner_user_id,
         submission.target_level, submission.skill_id
  into request_row
  from public.skill_review_requests request
  join public.skill_submissions submission on submission.id = request.submission_id
  where request.id = p_request_id
  for update of request;

  if not found then raise exception 'Review request not found.' using errcode = 'P0002'; end if;
  if request_row.owner_user_id = p_reviewer_user_id then raise exception 'You cannot review your own submission.' using errcode = '22023'; end if;
  if request_row.status <> 'open' then raise exception 'This review slot is no longer open.' using errcode = '55000'; end if;

  select exists (
    select 1 from public.user_skills reviewer_skill
    where reviewer_skill.user_id = p_reviewer_user_id
      and reviewer_skill.skill_id = request_row.skill_id
      and reviewer_skill.status = 'verified'
      and reviewer_skill.earned_skill_level >= request_row.target_level
  ) into eligible;

  if not p_bootstrap and not eligible then
    raise exception 'Reviewer needs an accepted equal or higher skill level.' using errcode = '42501';
  end if;

  update public.skill_review_requests
  set reviewer_user_id = p_reviewer_user_id, status = 'assigned', claimed_at = now()
  where id = p_request_id and status = 'open'
  returning id, status, reviewer_user_id into request_row;

  if not found then raise exception 'Review slot was claimed by another reviewer.' using errcode = '55000'; end if;
  return jsonb_build_object('request_id', request_row.id, 'status', request_row.status, 'reviewer_user_id', request_row.reviewer_user_id);
end;
$$;

create or replace function public.record_skill_review_decision(
  p_request_id uuid,
  p_reviewer_user_id uuid,
  p_verdict text,
  p_reproducibility boolean,
  p_criteria_met boolean,
  p_proof_sufficient boolean,
  p_safety boolean,
  p_critical_issue boolean,
  p_recommendation text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row record;
  decision_row record;
  decided_count integer;
  pass_count integer;
  critical_count integer;
  next_status text;
  core_level integer;
begin
  if p_verdict not in ('pass', 'rework') then raise exception 'Invalid review verdict.' using errcode = '22023'; end if;

  select request.id, request.status, request.reviewer_user_id, request.submission_id, request.evidence_id,
         submission.user_id as owner_user_id, submission.skill_id, submission.target_level
  into request_row
  from public.skill_review_requests request
  join public.skill_submissions submission on submission.id = request.submission_id
  where request.id = p_request_id
  for update of request;

  if not found then raise exception 'Review request not found.' using errcode = 'P0002'; end if;
  if request_row.reviewer_user_id <> p_reviewer_user_id then raise exception 'Claim this review before submitting a decision.' using errcode = '42501'; end if;
  if request_row.status <> 'assigned' then raise exception 'This review is already closed.' using errcode = '55000'; end if;

  insert into public.skill_review_decisions (
    request_id, evidence_id, reviewer_user_id, verdict, reproducibility, criteria_met,
    proof_sufficient, safety, critical_issue, recommendation, comment
  ) values (
    request_row.id, request_row.evidence_id, p_reviewer_user_id, p_verdict, p_reproducibility, p_criteria_met,
    p_proof_sufficient, p_safety, p_critical_issue, btrim(p_recommendation), btrim(p_comment)
  ) returning id into decision_row;

  update public.skill_review_requests
  set status = 'decided', decided_at = now()
  where id = request_row.id;

  select count(*), count(*) filter (where verdict = 'pass'), count(*) filter (where verdict = 'rework' and critical_issue)
  into decided_count, pass_count, critical_count
  from public.skill_review_decisions
  where evidence_id = request_row.evidence_id;

  if critical_count > 0 then
    next_status := 'rework';
    update public.skill_submissions
    set status = 'rework', rework_reason = 'A reviewer marked a critical issue. Address it and submit a new evidence version.', updated_at = now()
    where id = request_row.submission_id;
    insert into public.skill_progress_events (user_id, skill_id, submission_id, event_type, idempotency_key, metadata)
    values (
      request_row.owner_user_id, request_row.skill_id, request_row.submission_id, 'rework_requested',
      'rework_requested:' || request_row.evidence_id::text,
      jsonb_build_object('evidence_id', request_row.evidence_id, 'decided_count', decided_count, 'pass_count', pass_count)
    ) on conflict (user_id, idempotency_key) do nothing;
  elsif decided_count = 3 and pass_count >= 2 then
    next_status := 'accepted';
    select coalesce(level, 0) into core_level from public.user_profiles where user_id = request_row.owner_user_id;
    update public.skill_submissions
    set status = 'accepted', accepted_at = coalesce(accepted_at, now()), rework_reason = null, updated_at = now()
    where id = request_row.submission_id;
    insert into public.user_skills (user_id, skill_id, earned_skill_level, effective_skill_level, status)
    values (request_row.owner_user_id, request_row.skill_id, request_row.target_level, least(request_row.target_level, coalesce(core_level, 0)), 'verified')
    on conflict (user_id, skill_id) do update set
      earned_skill_level = greatest(user_skills.earned_skill_level, excluded.earned_skill_level),
      effective_skill_level = least(greatest(user_skills.earned_skill_level, excluded.earned_skill_level), coalesce(core_level, 0)),
      status = 'verified', updated_at = now();
    insert into public.skill_progress_events (user_id, skill_id, submission_id, event_type, idempotency_key, metadata)
    values (
      request_row.owner_user_id, request_row.skill_id, request_row.submission_id, 'skill_accepted',
      'skill_accepted:' || request_row.evidence_id::text,
      jsonb_build_object('earned_skill_level', request_row.target_level, 'effective_skill_level', least(request_row.target_level, coalesce(core_level, 0)), 'pass_count', pass_count)
    ) on conflict (user_id, idempotency_key) do nothing;
  elsif decided_count = 3 then
    next_status := 'rework';
    update public.skill_submissions
    set status = 'rework', rework_reason = 'The review set did not reach two of three passing verdicts.', updated_at = now()
    where id = request_row.submission_id;
    insert into public.skill_progress_events (user_id, skill_id, submission_id, event_type, idempotency_key, metadata)
    values (
      request_row.owner_user_id, request_row.skill_id, request_row.submission_id, 'rework_requested',
      'rework_requested:' || request_row.evidence_id::text,
      jsonb_build_object('evidence_id', request_row.evidence_id, 'decided_count', decided_count, 'pass_count', pass_count)
    ) on conflict (user_id, idempotency_key) do nothing;
  else
    next_status := 'in_review';
    update public.skill_submissions set status = 'in_review', updated_at = now() where id = request_row.submission_id;
  end if;

  return jsonb_build_object('decision_id', decision_row.id, 'status', next_status, 'decided_count', decided_count, 'pass_count', pass_count, 'critical_count', critical_count);
end;
$$;

revoke all on function public.submit_skill_evidence(uuid, text, text, text, text, text, text, text, text, boolean) from public, authenticated;
revoke all on function public.claim_skill_review_request(uuid, uuid, boolean) from public, authenticated;
revoke all on function public.record_skill_review_decision(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, text, text) from public, authenticated;
grant execute on function public.submit_skill_evidence(uuid, text, text, text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.claim_skill_review_request(uuid, uuid, boolean) to service_role;
grant execute on function public.record_skill_review_decision(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, text, text) to service_role;

insert into public.skills (slug, title, description, learning_path)
values (
  'software_creation',
  '{"en":"Software creation","ru":"Создание программных решений"}'::jsonb,
  '{"en":"Build a small working feature and make the result reproducible for another person.","ru":"Соберите небольшую работающую фичу и сделайте результат воспроизводимым для другого человека."}'::jsonb,
  '[
    {"key":"environment","en":"Choose a supported development environment and understand its limits.","ru":"Выберите поддерживаемую среду разработки и поймите её ограничения."},
    {"key":"ai_limits","en":"Review current AI-model trade-offs and the limits of vibecoding.","ru":"Разберите ограничения современных AI-моделей и vibecoding."},
    {"key":"git_flow","en":"Create a branch, commit the change, inspect the diff and prepare a review.","ru":"Создайте ветку, коммит, проверьте diff и подготовьте review."},
    {"key":"feature","en":"Ship one small feature with explicit acceptance criteria.","ru":"Сделайте одну небольшую фичу с явными критериями приёмки."}
  ]'::jsonb
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  learning_path = excluded.learning_path,
  is_active = true,
  updated_at = now();

insert into public.skill_level_rules (skill_id, level, requirements, rubric)
select
  skills.id,
  1,
  '{"en":"One working feature, repository/proof links, a reproducible test scenario and three independent reviews.","ru":"Одна работающая фича, ссылки на репозиторий и proof, воспроизводимый тестовый сценарий и три независимых review."}'::jsonb,
  '[
    {"key":"reproducibility","en":"Another person can reproduce the result from the supplied steps.","ru":"Другой человек может воспроизвести результат по указанным шагам."},
    {"key":"criteria","en":"The feature meets its stated acceptance criteria.","ru":"Фича соответствует заявленным критериям приёмки."},
    {"key":"proof","en":"The proof is sufficient and points to the actual deliverable.","ru":"Proof достаточен и ведёт к фактическому результату."},
    {"key":"safety","en":"The change handles obvious safety and data risks responsibly.","ru":"Изменение ответственно учитывает очевидные риски безопасности и данных."}
  ]'::jsonb
from public.skills
where skills.slug = 'software_creation'
on conflict (skill_id, level) do update set requirements = excluded.requirements, rubric = excluded.rubric;
