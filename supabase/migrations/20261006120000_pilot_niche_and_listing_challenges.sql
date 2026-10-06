-- Pilot challenges that seed first economic links:
-- 1) choose a direction and a first simple, in-demand practical task;
-- 2) publish the first Market listing (service, item or digital product).
-- Rewards are Core only, per the pilot rules.

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a01',
  '{"ru":"Найди направление и первую практическую задачу","en":"Find a direction and a first practical task"}'::jsonb,
  '{"ru":"Не знаете, что предложить людям? Выберите одно из самых простых и востребованных направлений и первую задачу к нему.","en":"Not sure what to offer? Pick one of the simplest in-demand directions and a first task for it."}'::jsonb,
  '{"ru":"Откройте челлендж, выберите направление и одну практическую задачу. Первый шаг займёт 15–30 минут. Можно сначала обсудить выбор с Новой.","en":"Open the challenge, pick a direction and one practical task. The first step takes 15–30 minutes. You can talk it over with Nova first."}'::jsonb,
  '{"ru":"Выбрана одна практическая задача из предложенного списка.","en":"One practical task from the suggested list is chosen."}'::jsonb,
  'self_discovery', 1, 3, 'auto', 'niche_task_chosen', 30, 'goals.desires', 1, 0, true
),
(
  '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a02',
  '{"ru":"Разместите первое объявление на маркетплейсе","en":"Publish your first Market listing"}'::jsonb,
  '{"ru":"Опишите услугу, товар или цифровой продукт, которые можете предложить, и установите цену.","en":"Describe a service, item or digital product you can offer and set a price."}'::jsonb,
  '{"ru":"Откройте Кошелёк → Маркет, создайте карточку с названием, описанием и ценой и опубликуйте её. Для услуги укажите срок выполнения. Реальные сделки не обязательны.","en":"Open Wallet → Market, create a card with a title, description and price, and publish it. For a service, set the delivery time. Real deals are not required."}'::jsonb,
  '{"ru":"У вас есть хотя бы одно опубликованное объявление.","en":"You have at least one published listing."}'::jsonb,
  'marketplace', 1, 7, 'auto', 'first_marketplace_listing', 31, 'wallet.market', 2, 0, true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    instructions = excluded.instructions,
    requirements = excluded.requirements,
    category = excluded.category,
    difficulty_level = excluded.difficulty_level,
    duration_days = excluded.duration_days,
    verification_type = excluded.verification_type,
    verification_logic = excluded.verification_logic,
    sort_order = excluded.sort_order,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount;
