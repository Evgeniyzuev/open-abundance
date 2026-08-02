-- Skill Passport foundation with server-authoritative automatic checks.
-- Manual submissions, evidence and human decisions are intentionally outside this MVP.

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
  level integer not null check (level between 1 and 20),
  verification_logic text not null check (verification_logic in (
    'referral_count',
    'public_post_count',
    'team_member_count',
    'team_contact_count',
    'challenge_completion_count'
  )),
  threshold bigint not null check (threshold > 0),
  requirements jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (skill_id, level)
);

create table if not exists public.user_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  earned_skill_level integer not null default 0 check (earned_skill_level between 0 and 20),
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  last_checked_at timestamptz,
  verification_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create index if not exists skills_active_idx on public.skills (is_active, slug);
create index if not exists skill_level_rules_skill_level_idx on public.skill_level_rules (skill_id, level);
create index if not exists user_skills_skill_level_idx on public.user_skills (skill_id, earned_skill_level desc);
create index if not exists user_skills_user_checked_idx on public.user_skills (user_id, last_checked_at desc);

alter table public.skills enable row level security;
alter table public.skill_level_rules enable row level security;
alter table public.user_skills enable row level security;

grant select on table public.skills, public.skill_level_rules to authenticated;
grant select on table public.user_skills to authenticated;
grant all on table public.skills, public.skill_level_rules, public.user_skills to service_role;

drop policy if exists "Authenticated users can read active skills" on public.skills;
create policy "Authenticated users can read active skills"
on public.skills for select to authenticated
using (is_active);

drop policy if exists "Authenticated users can read skill rules" on public.skill_level_rules;
create policy "Authenticated users can read skill rules"
on public.skill_level_rules for select to authenticated
using (exists (
  select 1
  from public.skills
  where skills.id = skill_level_rules.skill_id
    and skills.is_active
));

drop policy if exists "Users can read own skill levels" on public.user_skills;
create policy "Users can read own skill levels"
on public.user_skills for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.refresh_user_skill_levels(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  skill_row record;
  rule_row record;
  current_value bigint;
  calculated_level integer;
  checked_at timestamptz := now();
  snapshot jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;

  for skill_row in
    select skill.id
    from public.skills skill
    where skill.is_active
      and exists (
        select 1
        from public.skill_level_rules rule
        where rule.skill_id = skill.id
      )
  loop
    calculated_level := 0;
    snapshot := jsonb_build_object('checked_at', checked_at, 'checks', '[]'::jsonb);

    for rule_row in
      select rule.level, rule.verification_logic, rule.threshold
      from public.skill_level_rules rule
      where rule.skill_id = skill_row.id
      order by rule.level
    loop
      current_value := case rule_row.verification_logic
        when 'referral_count' then (
          select count(*)
          from public.referral_edges edge
          where edge.referrer_user_id = p_user_id
        )
        when 'public_post_count' then (
          select count(*)
          from public.feed_posts post
          where post.author_user_id = p_user_id
            and post.status = 'published'
            and post.visibility = 'public'
            and post.deleted_at is null
        )
        when 'team_member_count' then (
          select count(*)
          from public.team_memberships membership
          where membership.leader_user_id = p_user_id
            and membership.is_active
        )
        when 'team_contact_count' then (
          select count(*)
          from public.user_contacts contact
          where contact.owner_user_id = p_user_id
            and contact.status = 'active'
            and contact.source in ('team_leader', 'team_member')
        )
        when 'challenge_completion_count' then (
          select count(*)
          from public.challenge_completion_snapshots completion
          where completion.user_id = p_user_id
        )
        else 0
      end;

      if current_value >= rule_row.threshold then
        calculated_level := greatest(calculated_level, rule_row.level);
      end if;

      snapshot := jsonb_set(
        snapshot,
        '{checks}',
        (snapshot->'checks') || jsonb_build_array(jsonb_build_object(
          'level', rule_row.level,
          'verification_logic', rule_row.verification_logic,
          'threshold', rule_row.threshold,
          'current_value', current_value,
          'passed', current_value >= rule_row.threshold
        ))
      );
    end loop;

    insert into public.user_skills (
      user_id,
      skill_id,
      earned_skill_level,
      status,
      last_checked_at,
      verification_snapshot,
      updated_at
    ) values (
      p_user_id,
      skill_row.id,
      calculated_level,
      case when calculated_level > 0 then 'verified' else 'unverified' end,
      checked_at,
      snapshot,
      checked_at
    )
    on conflict (user_id, skill_id) do update
    set earned_skill_level = greatest(user_skills.earned_skill_level, excluded.earned_skill_level),
        status = case
          when greatest(user_skills.earned_skill_level, excluded.earned_skill_level) > 0 then 'verified'
          else 'unverified'
        end,
        last_checked_at = excluded.last_checked_at,
        verification_snapshot = excluded.verification_snapshot,
        updated_at = excluded.updated_at;
  end loop;

  return jsonb_build_object('user_id', p_user_id, 'checked_at', checked_at);
end;
$$;

revoke all on function public.refresh_user_skill_levels(uuid) from public, anon, authenticated;
grant execute on function public.refresh_user_skill_levels(uuid) to service_role;

insert into public.skills (slug, title, description, learning_path, is_active)
values
  (
    'referral_acquisition',
    '{"ru":"Привлечение участников","en":"Referral acquisition"}'::jsonb,
    '{"ru":"Умение приводить новых участников через личную ценность и приглашения.","en":"The ability to bring in new participants through personal value and invitations."}'::jsonb,
    '[{"ru":"Сформулируй понятное приглашение","en":"Write a clear invitation"},{"ru":"Пригласи первых участников","en":"Invite the first participants"}]'::jsonb,
    true
  ),
  (
    'content_creation',
    '{"ru":"Создание контента","en":"Content creation"}'::jsonb,
    '{"ru":"Умение регулярно публиковать полезные материалы для сообщества.","en":"The ability to publish useful material for the community consistently."}'::jsonb,
    '[{"ru":"Выбери полезную тему","en":"Choose a useful topic"},{"ru":"Опубликуй результат","en":"Publish the result"}]'::jsonb,
    true
  ),
  (
    'team_building',
    '{"ru":"Построение команды","en":"Team building"}'::jsonb,
    '{"ru":"Умение создавать устойчивую рабочую связку с участниками команды.","en":"The ability to build a sustainable working team with other participants."}'::jsonb,
    '[{"ru":"Помоги участнику войти в команду","en":"Help a participant join a team"},{"ru":"Поддержи совместную работу","en":"Support shared work"}]'::jsonb,
    true
  )
on conflict (slug) do update
set title = excluded.title,
    description = excluded.description,
    learning_path = excluded.learning_path,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.skill_level_rules (skill_id, level, verification_logic, threshold, requirements, metadata)
select skill.id, rule.level, rule.verification_logic, rule.threshold, rule.requirements, rule.metadata
from (
  values
    (
      'referral_acquisition',
      1,
      'referral_count',
      2::bigint,
      '{"ru":"Приведи 2 зарегистрированных участников.","en":"Bring in 2 registered participants."}'::jsonb,
      '{"metric":"referrals"}'::jsonb
    ),
    (
      'content_creation',
      1,
      'public_post_count',
      1::bigint,
      '{"ru":"Опубликуй 1 публичный материал.","en":"Publish 1 public post."}'::jsonb,
      '{"metric":"public_posts"}'::jsonb
    ),
    (
      'team_building',
      1,
      'team_member_count',
      1::bigint,
      '{"ru":"Собери команду хотя бы из 1 активного участника.","en":"Build a team with at least 1 active member."}'::jsonb,
      '{"metric":"team_members"}'::jsonb
    )
) as rule(slug, level, verification_logic, threshold, requirements, metadata)
join public.skills skill on skill.slug = rule.slug
on conflict (skill_id, level) do update
set verification_logic = excluded.verification_logic,
    threshold = excluded.threshold,
    requirements = excluded.requirements,
    metadata = excluded.metadata;
