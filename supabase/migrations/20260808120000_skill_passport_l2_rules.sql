insert into public.skill_level_rules (
  skill_id,
  level,
  verification_logic,
  threshold,
  requirements,
  metadata
)
select
  skill.id,
  rule.level,
  rule.verification_logic,
  rule.threshold,
  rule.requirements,
  rule.metadata
from (
  values
    (
      'referral_acquisition',
      2,
      'referral_count',
      5::bigint,
      '{"ru":"Приведи 5 зарегистрированных участников.","en":"Bring in 5 registered participants."}'::jsonb,
      '{"metric":"referrals"}'::jsonb
    ),
    (
      'content_creation',
      2,
      'public_post_count',
      3::bigint,
      '{"ru":"Опубликуй 3 публичных материала.","en":"Publish 3 public posts."}'::jsonb,
      '{"metric":"public_posts"}'::jsonb
    ),
    (
      'team_building',
      2,
      'team_member_count',
      3::bigint,
      '{"ru":"Собери команду хотя бы из 3 активных участников.","en":"Build a team with at least 3 active members."}'::jsonb,
      '{"metric":"team_members"}'::jsonb
    )
) as rule(slug, level, verification_logic, threshold, requirements, metadata)
join public.skills skill on skill.slug = rule.slug
on conflict (skill_id, level) do update
set verification_logic = excluded.verification_logic,
    threshold = excluded.threshold,
    requirements = excluded.requirements,
    metadata = excluded.metadata;
