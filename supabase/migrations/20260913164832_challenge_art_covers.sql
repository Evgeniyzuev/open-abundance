-- Keep the existing AI Recommendations and Invite a Friend covers unchanged.
-- Only assign artwork to the selected active catalog entries.
update public.challenges as challenge
set image_url = artwork.image_url
from (values
  ('has_wish', '/challenges/main-wish-path.jpg'),
  ('profile_strengths_filled', '/challenges/personal-value-notebook.jpg'),
  ('team_contact_active', '/challenges/team-welcome-hands.jpg'),
  ('today_core_target_reached', '/core/core-reactor-pearl.webp'),
  ('calculate_time_to_goal', '/challenges/growth-plan-astrolabe.png'),
  ('first_growth_post_published', '/challenges/first-result-prism.png'),
  ('attention_value_audit', '/challenges/attention-hourglass.png'),
  ('skill_profile_completed', '/challenges/skill-gem-key.png')
) as artwork(verification_logic, image_url)
where challenge.verification_logic = artwork.verification_logic
  and challenge.is_active = true;
