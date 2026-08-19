with level_rules(slug, level, verification_logic, threshold) as (
  values
    ('referral_acquisition', 3, 'referral_count', 10::bigint),
    ('referral_acquisition', 4, 'referral_count', 20::bigint),
    ('referral_acquisition', 5, 'referral_count', 35::bigint),
    ('referral_acquisition', 6, 'referral_count', 50::bigint),
    ('referral_acquisition', 7, 'referral_count', 75::bigint),
    ('referral_acquisition', 8, 'referral_count', 100::bigint),
    ('referral_acquisition', 9, 'referral_count', 150::bigint),
    ('referral_acquisition', 10, 'referral_count', 250::bigint),
    ('content_creation', 3, 'public_post_count', 5::bigint),
    ('content_creation', 4, 'public_post_count', 10::bigint),
    ('content_creation', 5, 'public_post_count', 20::bigint),
    ('content_creation', 6, 'public_post_count', 30::bigint),
    ('content_creation', 7, 'public_post_count', 50::bigint),
    ('content_creation', 8, 'public_post_count', 75::bigint),
    ('content_creation', 9, 'public_post_count', 100::bigint),
    ('content_creation', 10, 'public_post_count', 150::bigint),
    ('team_building', 3, 'team_member_count', 5::bigint),
    ('team_building', 4, 'team_member_count', 10::bigint),
    ('team_building', 5, 'team_member_count', 15::bigint),
    ('team_building', 6, 'team_member_count', 25::bigint),
    ('team_building', 7, 'team_member_count', 40::bigint),
    ('team_building', 8, 'team_member_count', 60::bigint),
    ('team_building', 9, 'team_member_count', 100::bigint),
    ('team_building', 10, 'team_member_count', 150::bigint)
)
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
  case rule.verification_logic
    when 'referral_count' then jsonb_build_object('ru', format('Приведи %s зарегистрированных участников.', rule.threshold), 'en', format('Bring in %s registered participants.', rule.threshold))
    when 'public_post_count' then jsonb_build_object('ru', format('Опубликуй %s публичных материалов.', rule.threshold), 'en', format('Publish %s public posts.', rule.threshold))
    when 'team_member_count' then jsonb_build_object('ru', format('Собери команду хотя бы из %s активных участников.', rule.threshold), 'en', format('Build a team with at least %s active members.', rule.threshold))
  end,
  jsonb_build_object('metric', case rule.verification_logic
    when 'referral_count' then 'referrals'
    when 'public_post_count' then 'public_posts'
    when 'team_member_count' then 'team_members'
  end)
from level_rules rule
join public.skills skill on skill.slug = rule.slug
on conflict (skill_id, level) do update
set verification_logic = excluded.verification_logic,
    threshold = excluded.threshold,
    requirements = excluded.requirements,
    metadata = excluded.metadata;
