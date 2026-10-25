-- Rename "humanity confirmation" to "confirm you are not a robot" in challenge texts (ru and en).
-- Text-only: verification_logic, rewards and eligibility stay the same.
create or replace function pg_temp.not_a_robot(value jsonb) returns jsonb language sql as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(replace(replace(replace(replace(
    value::text,
    'Подтверждение человечности', 'Подтверждение, что вы не робот'),
    'Подтвердите, что вы реальный человек', 'Подтвердите, что вы не робот'),
    'который прошёл проверку человечности', 'который подтвердил, что он не робот'),
    'которые прошли проверку человечности', 'которые подтвердили, что они не роботы'),
    'приглашённый пройдёт проверку человечности', 'приглашённый подтвердит, что он не робот'),
    'и пройти проверку человечности', 'и подтвердить, что он не робот'),
    'за подтверждение им человечности', 'за его подтверждение, что он не робот'),
    'Когда он подтвердит, что он человек', 'Когда он подтвердит, что он не робот'),
    'Humanity confirmation', 'Confirm you are not a robot'),
    'Confirm you are a real person', 'Confirm you are not a robot'),
    'who passed the humanity check', 'who confirmed they are not a robot'),
    'person passes the humanity check', 'person confirms they are not a robot'),
    'and pass the humanity check', 'and confirm they are not a robot'),
    'and for their humanity confirmation', 'and for their confirmation that they are not a robot'),
    'they confirm they are a person', 'they confirm they are not a robot')::jsonb
$$;

update public.challenges
set
  title = pg_temp.not_a_robot(title),
  description = pg_temp.not_a_robot(description),
  instructions = case when instructions is null then null else pg_temp.not_a_robot(instructions) end
where (title::text || description::text || coalesce(instructions::text, '')) ~* '(человечн|что он человек|реальный человек|humanity|are a (real )?person)';
