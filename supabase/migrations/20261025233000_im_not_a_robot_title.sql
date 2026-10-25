-- The check is now called simply "Я не робот" / "I'm not a robot".
update public.challenges
set title = jsonb_set(jsonb_set(title, '{ru}', '"Я не робот"'), '{en}', '"I''m not a robot"')
where verification_logic = 'humanity_confirmed';
