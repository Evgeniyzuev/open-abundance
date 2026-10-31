-- Founder decision 2026-10-31: two tasks become plain and checkable by the button in the task.
-- «3 дня» (was «Три дня фокуса», manual review that never passed): any 3 days, not in a row, with at least one
-- completed task each; checked automatically (lib/simpleQuests.ts questDays).
-- «Помоги новичку» (was a newcomer task confirmed in Teams): a person who came by your link or is in your team
-- completes any task after you took this one; the old Teams way still counts. The card lists the newcomers.
-- Rewards are not changed.
begin;

update public.challenges
set
  title = coalesce(title, '{}'::jsonb) || '{"ru": "3 дня", "en": "3 days"}'::jsonb,
  description = coalesce(description, '{}'::jsonb) || '{"ru": "Выполни хотя бы одно задание в 3 разных дня. Подряд не нужно.", "en": "Complete at least one task on 3 different days. They need not be in a row."}'::jsonb,
  instructions = coalesce(instructions, '{}'::jsonb) || '{"ru": "1. Выполни любое задание сегодня.\n2. Выполни ещё по одному заданию в два других дня, можно не подряд.\n3. Когда наберётся 3 дня, нажми «Проверить выполнение».", "en": "1. Complete any task today.\n2. Complete one more task on two other days, not necessarily in a row.\n3. When you have 3 days, tap Check completion."}'::jsonb,
  requirements = coalesce(requirements, '{}'::jsonb) || '{"ru": "3 разных дня, в каждый выполнено хотя бы одно задание. Само это задание не считается.", "en": "3 different days with at least one completed task each. This task itself does not count."}'::jsonb,
  verification_type = 'auto',
  action_view = null
where verification_logic = 'three_day_focus';

update public.challenges
set
  title = coalesce(title, '{}'::jsonb) || '{"ru": "Помоги новичку", "en": "Help a newcomer"}'::jsonb,
  description = coalesce(description, '{}'::jsonb) || '{"ru": "Помоги человеку, который пришёл по твоей ссылке, или участнику твоей команды выполнить любое задание.", "en": "Help someone who came by your link, or a member of your team, complete any task."}'::jsonb,
  instructions = coalesce(instructions, '{}'::jsonb) || '{"ru": "1. Возьми это задание: с этого момента считаются задания новичка.\n2. Открой карточку: там список твоих новичков (пришли по твоей ссылке или в твоей команде). Если никого нет, отправь свою ссылку.\n3. Напиши новичку и помоги выполнить любое задание: покажи раздел «Задания», ответь на вопросы.\n4. Когда рядом с его именем появится ✓, нажми «Проверить выполнение».", "en": "1. Take this task: from now on the newcomer''s tasks count.\n2. Open the card: it lists your newcomers (came by your link or are in your team). If there is nobody, send your link.\n3. Message a newcomer and help them complete any task: show them Tasks, answer questions.\n4. When a ✓ appears next to their name, tap Check completion."}'::jsonb,
  requirements = coalesce(requirements, '{}'::jsonb) || '{"ru": "Человек, пришедший по твоей ссылке, или участник твоей команды выполнил любое задание после того, как ты взял это.", "en": "Someone who came by your link, or a member of your team, completed any task after you took this one."}'::jsonb,
  reward_label = coalesce(reward_label, '{}'::jsonb) || '{"ru": "Новичок выполнил задание", "en": "A newcomer completed a task"}'::jsonb,
  verification_type = 'auto',
  action_view = null
where verification_logic = 'team_task_help_completed';

commit;
