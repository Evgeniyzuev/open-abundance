-- App Testing challenge: private beta feedback + public project reviews.
alter table public.feed_posts
drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
add constraint feed_posts_post_type_check
check (post_type in ('daily_progress', 'manual', 'external_link', 'wish', 'reality_demo', 'system_story', 'challenge', 'project_review'));

create table if not exists public.challenge_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  schema_version integer not null default 1 check (schema_version > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  platform text check (platform in ('ios', 'android', 'desktop', 'other')),
  install_outcome text check (install_outcome in ('installed_now', 'already_installed', 'failed', 'not_available')),
  answers jsonb not null default '{}'::jsonb,
  overall_rating integer check (overall_rating between 1 and 5),
  most_useful_area text,
  daily_use_intent text,
  main_difficulty text,
  private_comment text,
  mission_rating integer check (mission_rating between 1 and 5),
  attitude text,
  strongest_area text,
  main_concern text,
  public_review text,
  context jsonb not null default '{}'::jsonb,
  public_consent_version text,
  public_consent_at timestamptz,
  feed_post_id uuid references public.feed_posts(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create table if not exists public.feed_project_review_metadata (
  post_id uuid primary key references public.feed_posts(id) on delete cascade,
  feedback_submission_id uuid not null unique references public.challenge_feedback_submissions(id) on delete cascade,
  overall_rating integer not null check (overall_rating between 1 and 5),
  mission_rating integer not null check (mission_rating between 1 and 5),
  attitude text not null check (attitude in ('inspired', 'interested_questions', 'neutral', 'skeptical', 'not_aligned')),
  most_useful_area text not null check (most_useful_area in ('today', 'goals', 'ai', 'wallet', 'people', 'challenges', 'other')),
  challenge_reward_amount numeric(12, 2) not null default 3 check (challenge_reward_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists challenge_feedback_submissions_status_idx
on public.challenge_feedback_submissions (challenge_id, status, submitted_at desc);

create index if not exists feed_project_review_metadata_rating_idx
on public.feed_project_review_metadata (overall_rating, created_at desc);

alter table public.challenge_feedback_submissions enable row level security;
alter table public.feed_project_review_metadata enable row level security;

revoke all on table public.challenge_feedback_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.challenge_feedback_submissions to service_role;

grant select on table public.feed_project_review_metadata to authenticated;
grant select, insert, update, delete on table public.feed_project_review_metadata to service_role;

drop policy if exists "Authenticated users can read published project review metadata" on public.feed_project_review_metadata;
create policy "Authenticated users can read published project review metadata"
on public.feed_project_review_metadata
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts
    where feed_posts.id = feed_project_review_metadata.post_id
      and feed_posts.post_type = 'project_review'
      and feed_posts.status = 'published'
      and feed_posts.visibility = 'public'
      and feed_posts.deleted_at is null
  )
);

drop trigger if exists touch_challenge_feedback_submissions_updated_at on public.challenge_feedback_submissions;
create trigger touch_challenge_feedback_submissions_updated_at
before update on public.challenge_feedback_submissions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_feed_project_review_metadata_updated_at on public.feed_project_review_metadata;
create trigger touch_feed_project_review_metadata_updated_at
before update on public.feed_project_review_metadata
for each row execute function public.touch_updated_at();

create or replace function public.get_project_review_summary()
returns table (
  average_rating numeric,
  review_count bigint,
  star_5_count bigint,
  star_4_count bigint,
  star_3_count bigint,
  star_2_count bigint,
  star_1_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(avg(metadata.overall_rating), 0)::numeric as average_rating,
    count(*)::bigint as review_count,
    count(*) filter (where metadata.overall_rating = 5)::bigint as star_5_count,
    count(*) filter (where metadata.overall_rating = 4)::bigint as star_4_count,
    count(*) filter (where metadata.overall_rating = 3)::bigint as star_3_count,
    count(*) filter (where metadata.overall_rating = 2)::bigint as star_2_count,
    count(*) filter (where metadata.overall_rating = 1)::bigint as star_1_count
  from public.feed_project_review_metadata as metadata
  join public.feed_posts as posts on posts.id = metadata.post_id
  where posts.post_type = 'project_review'
    and posts.status = 'published'
    and posts.visibility = 'public'
    and posts.deleted_at is null;
$$;

revoke all on function public.get_project_review_summary() from public, anon, authenticated;
grant execute on function public.get_project_review_summary() to service_role;

update public.challenges
set
  title = '{"en":"Test Open Abundance","ru":"Протестируй Open Abundance"}'::jsonb,
  description = '{"en":"Install the app, test its main areas, share detailed feedback and publish an honest review.","ru":"Установи приложение, проверь основные разделы, оставь подробную обратную связь и опубликуй честный отзыв."}'::jsonb,
  instructions = '{"en":"Complete the six testing sections, answer the private QA questions and preview your public project review.","ru":"Пройди шесть разделов тестирования, ответь на приватные QA-вопросы и проверь публичный отзыв перед публикацией."}'::jsonb,
  requirements = '{"en":"A complete technical survey, a 100+ character public review and consent to publish it from your profile.","ru":"Заполненная техническая анкета, публичный отзыв от 100 символов и согласие опубликовать его от своего профиля."}'::jsonb,
  reward_label = '{"en":"Core +3$","ru":"Core +3$"}'::jsonb,
  verification_type = 'auto',
  verification_logic = 'app_testing_feedback',
  duration_days = 1,
  image_url = null
where id = '03bfd7f2-6d8e-414a-a925-1181424eab45';

create or replace function public.submit_app_testing_feedback(
  p_user_id uuid,
  p_challenge_id uuid,
  p_schema_version integer,
  p_platform text,
  p_install_outcome text,
  p_answers jsonb,
  p_overall_rating integer,
  p_most_useful_area text,
  p_daily_use_intent text,
  p_main_difficulty text,
  p_private_comment text,
  p_mission_rating integer,
  p_attitude text,
  p_strongest_area text,
  p_main_concern text,
  p_public_review text,
  p_context jsonb,
  p_consent_version text
)
returns table (
  submission_id uuid,
  feed_post_id uuid,
  challenge_status text,
  reward_claimed boolean,
  rewarded_amount numeric,
  core_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.challenge_feedback_submissions%rowtype;
  v_submission public.challenge_feedback_submissions%rowtype;
  v_post public.feed_posts%rowtype;
  v_challenge_status text;
  v_answer jsonb;
  v_section text;
  v_completion record;
  v_core_balance numeric;
begin
  if not exists (
    select 1
    from public.challenges
    where id = p_challenge_id
      and is_active = true
      and verification_logic = 'app_testing_feedback'
  ) then
    raise exception 'App testing challenge is unavailable.';
  end if;

  select status
  into v_challenge_status
  from public.user_challenges
  where user_id = p_user_id and challenge_id = p_challenge_id
  for update;

  if v_challenge_status is null then
    raise exception 'Accept the challenge before submitting feedback.';
  end if;

  select *
  into v_existing
  from public.challenge_feedback_submissions
  where user_id = p_user_id and challenge_id = p_challenge_id
  for update;

  if v_existing.status = 'submitted' and v_existing.feed_post_id is not null then
    select balance into v_core_balance from public.core_accounts where user_id = p_user_id;
    return query
    select v_existing.id, v_existing.feed_post_id, 'completed'::text, false, 3::numeric, v_core_balance;
    return;
  end if;

  if p_schema_version <> 1 then
    raise exception 'Unsupported feedback schema version.';
  end if;

  if p_platform not in ('ios', 'android', 'desktop', 'other') then
    raise exception 'Choose a supported platform.';
  end if;

  if p_install_outcome not in ('installed_now', 'already_installed', 'failed', 'not_available') then
    raise exception 'Choose the installation result.';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Feedback answers must be an object.';
  end if;

  foreach v_section in array array['install', 'home_today', 'goals', 'ai', 'wallet', 'people']
  loop
    v_answer := p_answers -> v_section;
    if v_answer is null or jsonb_typeof(v_answer) <> 'object' then
      raise exception 'Complete every testing section.';
    end if;
    if coalesce(v_answer ->> 'outcome', '') not in ('worked', 'partly', 'failed', 'unclear') then
      raise exception 'Choose a valid result for every testing section.';
    end if;
    if jsonb_typeof(v_answer -> 'rating') <> 'number'
      or (v_answer ->> 'rating')::integer not between 1 and 5 then
      raise exception 'Rate every testing section from 1 to 5.';
    end if;
    if char_length(coalesce(v_answer ->> 'comment', '')) > 1000 then
      raise exception 'A section comment is too long.';
    end if;
    if v_answer ->> 'outcome' <> 'worked'
      and char_length(btrim(coalesce(v_answer ->> 'comment', ''))) = 0 then
      raise exception 'Explain every partial, failed or unclear result.';
    end if;
  end loop;

  if p_overall_rating not between 1 and 5 or p_mission_rating not between 1 and 5 then
    raise exception 'Overall and mission ratings must be from 1 to 5.';
  end if;

  if p_most_useful_area not in ('today', 'goals', 'ai', 'wallet', 'people', 'challenges', 'other') then
    raise exception 'Choose the most useful area.';
  end if;

  if p_daily_use_intent not in ('yes', 'probably', 'unsure', 'unlikely') then
    raise exception 'Choose your usage intent.';
  end if;

  if p_attitude not in ('inspired', 'interested_questions', 'neutral', 'skeptical', 'not_aligned') then
    raise exception 'Choose your attitude to the project.';
  end if;

  if p_strongest_area not in ('mission', 'goals', 'today', 'ai', 'core', 'community', 'other') then
    raise exception 'Choose the project strength.';
  end if;

  if p_main_concern not in ('complexity', 'trust', 'economics', 'privacy', 'unclear_value', 'early_stage', 'none', 'other') then
    raise exception 'Choose the main concern.';
  end if;

  if char_length(btrim(coalesce(p_main_difficulty, ''))) = 0 or char_length(p_main_difficulty) > 1000 then
    raise exception 'Describe the main difficulty or missing feature.';
  end if;

  if char_length(btrim(coalesce(p_private_comment, ''))) not between 50 and 2000 then
    raise exception 'The private technical comment must contain 50 to 2000 characters.';
  end if;

  if char_length(btrim(coalesce(p_public_review, ''))) not between 100 and 1500 then
    raise exception 'The public review must contain 100 to 1500 characters.';
  end if;

  if coalesce(p_consent_version, '') <> 'project_review_v1' then
    raise exception 'Public review consent is required.';
  end if;

  insert into public.challenge_feedback_submissions (
    user_id,
    challenge_id,
    schema_version,
    status,
    platform,
    install_outcome,
    answers,
    overall_rating,
    most_useful_area,
    daily_use_intent,
    main_difficulty,
    private_comment,
    mission_rating,
    attitude,
    strongest_area,
    main_concern,
    public_review,
    context,
    public_consent_version,
    public_consent_at,
    submitted_at
  )
  values (
    p_user_id,
    p_challenge_id,
    p_schema_version,
    'submitted',
    p_platform,
    p_install_outcome,
    p_answers,
    p_overall_rating,
    p_most_useful_area,
    p_daily_use_intent,
    btrim(p_main_difficulty),
    btrim(p_private_comment),
    p_mission_rating,
    p_attitude,
    p_strongest_area,
    p_main_concern,
    btrim(p_public_review),
    coalesce(p_context, '{}'::jsonb),
    p_consent_version,
    now(),
    now()
  )
  on conflict (user_id, challenge_id) do update
  set
    schema_version = excluded.schema_version,
    status = 'submitted',
    platform = excluded.platform,
    install_outcome = excluded.install_outcome,
    answers = excluded.answers,
    overall_rating = excluded.overall_rating,
    most_useful_area = excluded.most_useful_area,
    daily_use_intent = excluded.daily_use_intent,
    main_difficulty = excluded.main_difficulty,
    private_comment = excluded.private_comment,
    mission_rating = excluded.mission_rating,
    attitude = excluded.attitude,
    strongest_area = excluded.strongest_area,
    main_concern = excluded.main_concern,
    public_review = excluded.public_review,
    context = excluded.context,
    public_consent_version = excluded.public_consent_version,
    public_consent_at = excluded.public_consent_at,
    submitted_at = excluded.submitted_at
  returning * into v_submission;

  insert into public.feed_posts (
    author_user_id,
    post_type,
    status,
    visibility,
    body,
    published_at
  )
  values (
    p_user_id,
    'project_review',
    'published',
    'public',
    btrim(p_public_review),
    now()
  )
  returning * into v_post;

  insert into public.feed_project_review_metadata (
    post_id,
    feedback_submission_id,
    overall_rating,
    mission_rating,
    attitude,
    most_useful_area,
    challenge_reward_amount
  )
  values (
    v_post.id,
    v_submission.id,
    p_overall_rating,
    p_mission_rating,
    p_attitude,
    p_most_useful_area,
    3
  );

  update public.challenge_feedback_submissions
  set feed_post_id = v_post.id
  where id = v_submission.id;

  select *
  into v_completion
  from public.complete_user_challenge(p_user_id, p_challenge_id, 'core', 3)
  limit 1;

  update public.user_challenges
  set verification_data = jsonb_build_object(
    'feedback_submission_id', v_submission.id,
    'feed_post_id', v_post.id,
    'schema_version', p_schema_version,
    'submitted_at', now()
  )
  where user_id = p_user_id and challenge_id = p_challenge_id;

  select balance into v_core_balance from public.core_accounts where user_id = p_user_id;

  return query
  select
    v_submission.id,
    v_post.id,
    coalesce(v_completion.challenge_status, 'completed'::text),
    coalesce(v_completion.reward_claimed, false),
    coalesce(v_completion.rewarded_amount, 3::numeric),
    v_core_balance;
end;
$$;

revoke all on function public.submit_app_testing_feedback(
  uuid, uuid, integer, text, text, jsonb, integer, text, text, text, text,
  integer, text, text, text, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.submit_app_testing_feedback(
  uuid, uuid, integer, text, text, jsonb, integer, text, text, text, text,
  integer, text, text, text, text, jsonb, text
) to service_role;
