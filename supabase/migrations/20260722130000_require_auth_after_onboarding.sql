-- Registration is now the final onboarding action, not a catalog challenge.
-- Keep the row for historical user_challenges and reward accounting.
update public.challenges
set
  is_active = false,
  track_key = null,
  track_step = null,
  prerequisite_challenge_id = null,
  action_view = null
where verification_logic = 'signup';

update public.challenges
set prerequisite_challenge_id = null
where prerequisite_challenge_id in (
  select id
  from public.challenges
  where verification_logic = 'signup'
);

with ordered_path as (
  select
    id,
    row_number() over (order by track_step asc, sort_order asc, id asc)::integer as next_track_step
  from public.challenges
  where track_key = 'first_core_path'
)
update public.challenges as challenge
set track_step = ordered_path.next_track_step
from ordered_path
where challenge.id = ordered_path.id;
