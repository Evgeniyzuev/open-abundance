-- Quests (docs/QUEST_PATH_PLAN.md 11.4, founder decisions 2026-10-26):
-- 1) "Choose your main wish" becomes "First wish": five simple wishes in one tap or your own, and Nova reacts.
-- 2) "Plan the way to your wish" and "Core law and the power of compound interest" merge into "The power of Core":
--    the calculator over 30 years at $10 a day, "how do you like the sum?", then your own goal and daily Core target.
--    The reward is the two old rewards together; the Core law quest is retired.
-- 3) "Price of your attention" leaves the path (stays a side quest). The path is 8 steps.

update public.challenges
set title = '{"ru":"Первое желание","en":"First wish"}'::jsonb,
    description = '{"ru":"Выбери одно из простых желаний или напиши своё. С него начнётся твой путь.","en":"Pick one of the simple wishes or write your own. Your path starts with it."}'::jsonb
where verification_logic = 'has_wish';

update public.challenges
set title = '{"ru":"Сила Core","en":"The power of Core"}'::jsonb,
    description = '{"ru":"Посчитай в калькуляторе, сколько Core будет через 30 лет, если делать квесты на $10 в день, потом рассчитай свою цель и поставь дневную цель.","en":"Use the calculator to see how much Core you would have in 30 years doing $10 of quests a day, then plan your own goal and set a daily target."}'::jsonb,
    core_reward_amount = 2
where verification_logic = 'calculate_time_to_goal';

update public.challenges set path_order = null, is_active = false where verification_logic = 'core_law_understood';
update public.challenges set path_order = null where verification_logic = 'attention_value_audit';

-- Close the gaps (the path index is checked row by row, so through a high range).
update public.challenges set path_order = path_order + 100 where path_order is not null;
with ordered as (
  select id, row_number() over (order by path_order) as step from public.challenges where path_order is not null
)
update public.challenges c set path_order = ordered.step from ordered where c.id = ordered.id;
