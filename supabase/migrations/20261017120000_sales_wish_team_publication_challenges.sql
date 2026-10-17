-- Challenges for results that grow the system: sales, the first fulfilled wish, the first team task, and
-- a wider ladder of external publications. Rewards are Core (founder decision 2026-10-17); the amounts live in
-- the rows below and can be changed there without code.
--
--   first sale (any completed Market deal as a seller)            Core +1
--   total sales of $10 / $100 / $1000 (any completed deals)       Core +1 / +2 / +5
--   the first fulfilled wish (any wish with the status completed)  Core +1
--   the first team task completed (accepted by the leader)         Core +1
--   publications at 1 / 5 / 10 / 20 / 50 approved                  Core +1 / +1 / +2 / +3 / +5
--
-- Nobody has started the publication ladder yet (no user_challenges and no submissions), so its steps are
-- changed in place; the old targets were 1, 3, 6 and 12.

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e20',
  '{"ru":"Первая продажа","en":"First sale"}'::jsonb,
  '{"ru":"Продайте что-нибудь другому участнику на Маркете и получите оплату в $.","en":"Sell something to another member on the Market and get paid in $."}'::jsonb,
  '{"ru":"1. Разместите объявление в Кошельке → Маркет.\n2. Договоритесь с покупателем и завершите сделку.\n3. Нажмите «Проверить выполнение».","en":"1. Publish a listing in Wallet → Market.\n2. Agree with the buyer and complete the deal.\n3. Press Check completion."}'::jsonb,
  '{"ru":"Завершена хотя бы одна ваша продажа.","en":"At least one of your sales is completed."}'::jsonb,
  'marketplace', 2, 14, 'auto', 'first_sale', 32, 'wallet.market', 1, 0, true
),
(
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e21',
  '{"ru":"Продажи на 10 $","en":"$10 in sales"}'::jsonb,
  '{"ru":"Доведите сумму завершённых продаж на Маркете до 10 $.","en":"Bring your completed Market sales to $10."}'::jsonb,
  '{"ru":"Продавайте услуги, товары или цифровые продукты. Считаются все завершённые сделки, где вы продавец.","en":"Sell services, goods or digital products. Every completed deal where you are the seller counts."}'::jsonb,
  '{"ru":"Сумма завершённых продаж не меньше 10 $.","en":"Completed sales total at least $10."}'::jsonb,
  'marketplace', 2, 30, 'auto', 'sales_total_10', 33, 'wallet.market', 1, 0, true
),
(
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e22',
  '{"ru":"Продажи на 100 $","en":"$100 in sales"}'::jsonb,
  '{"ru":"Доведите сумму завершённых продаж на Маркете до 100 $.","en":"Bring your completed Market sales to $100."}'::jsonb,
  '{"ru":"Повторяйте то, что уже продаётся, и добавляйте новые предложения. Считаются все завершённые сделки, где вы продавец.","en":"Repeat what already sells and add new offers. Every completed deal where you are the seller counts."}'::jsonb,
  '{"ru":"Сумма завершённых продаж не меньше 100 $.","en":"Completed sales total at least $100."}'::jsonb,
  'marketplace', 3, 60, 'auto', 'sales_total_100', 34, 'wallet.market', 2, 0, true
),
(
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e23',
  '{"ru":"Продажи на 1 000 $","en":"$1,000 in sales"}'::jsonb,
  '{"ru":"Доведите сумму завершённых продаж на Маркете до 1 000 $.","en":"Bring your completed Market sales to $1,000."}'::jsonb,
  '{"ru":"Стройте повторяемый продукт или услугу. Считаются все завершённые сделки, где вы продавец.","en":"Build a repeatable product or service. Every completed deal where you are the seller counts."}'::jsonb,
  '{"ru":"Сумма завершённых продаж не меньше 1 000 $.","en":"Completed sales total at least $1,000."}'::jsonb,
  'marketplace', 4, 120, 'auto', 'sales_total_1000', 35, 'wallet.market', 5, 0, true
),
(
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e24',
  '{"ru":"Первое исполненное желание","en":"Your first fulfilled wish"}'::jsonb,
  '{"ru":"Доведите хотя бы одно желание до исполнения и отметьте его исполненным.","en":"Take at least one wish to fulfilment and mark it fulfilled."}'::jsonb,
  '{"ru":"1. Выберите желание и идите к нему по шагам.\n2. Когда оно исполнилось, откройте его в «Желаниях» и отметьте исполненным.\n3. Нажмите «Проверить выполнение».","en":"1. Pick a wish and move to it step by step.\n2. When it is fulfilled, open it in Wishes and mark it fulfilled.\n3. Press Check completion."}'::jsonb,
  '{"ru":"У вас есть хотя бы одно исполненное желание.","en":"You have at least one fulfilled wish."}'::jsonb,
  'start_path', 3, 30, 'auto', 'first_wish_fulfilled', 36, 'goals.desires', 1, 0, true
),
(
  'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e25',
  '{"ru":"Первое задание от лида","en":"Your first task from your lead"}'::jsonb,
  '{"ru":"Выполните задание, которое поставил ваш лид, и получите его подтверждение.","en":"Complete a task your lead set for you and get it confirmed."}'::jsonb,
  '{"ru":"1. Откройте командные задания в разделе «Общение».\n2. Примите и выполните задание.\n3. Дождитесь подтверждения лида и нажмите «Проверить выполнение».","en":"1. Open the team tasks in the Social section.\n2. Accept and complete the task.\n3. Wait for your lead to confirm and press Check completion."}'::jsonb,
  '{"ru":"Лид подтвердил хотя бы одно ваше задание.","en":"Your lead confirmed at least one of your tasks."}'::jsonb,
  'social', 2, 14, 'auto', 'first_team_task_done', 37, 'teams', 1, 0, true
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

-- The publication ladder: 1, 5, 10, 20 and 50 approved publications.
update public.challenges set
  acquisition_target = 5,
  title = '{"ru":"Пять внешних публикаций","en":"Five external publications"}'::jsonb,
  description = '{"ru":"Собери серию из пяти одобренных публикаций на подходящих площадках.","en":"Build a series of five approved publications on suitable platforms."}'::jsonb,
  requirements = '{"ru":"Заверши предыдущий milestone и набери 5 одобренных публикаций.","en":"Complete the previous milestone and reach 5 approved publications."}'::jsonb,
  core_reward_amount = 1
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f02';

update public.challenges set
  acquisition_target = 10,
  title = '{"ru":"Десять внешних публикаций","en":"Ten external publications"}'::jsonb,
  description = '{"ru":"Поддерживай регулярное распространение и собери десять одобренных материалов.","en":"Keep distributing consistently and reach ten approved pieces."}'::jsonb,
  requirements = '{"ru":"Заверши предыдущий milestone и набери 10 одобренных публикаций.","en":"Complete the previous milestone and reach 10 approved publications."}'::jsonb,
  core_reward_amount = 2
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f03';

update public.challenges set
  acquisition_target = 20,
  title = '{"ru":"Двадцать внешних публикаций","en":"Twenty external publications"}'::jsonb,
  description = '{"ru":"Сформируй устойчивый внешний канал и собери двадцать одобренных материалов.","en":"Build a sustained external channel and reach twenty approved pieces."}'::jsonb,
  requirements = '{"ru":"Заверши предыдущий milestone и набери 20 одобренных публикаций.","en":"Complete the previous milestone and reach 20 approved publications."}'::jsonb,
  core_reward_amount = 3
where id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f04';

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, acquisition_series, acquisition_target, acquisition_metric_key,
  core_reward_amount, wallet_reward_amount, is_active
)
select
  '55bb0d7b-ef78-46f8-9c02-c8ba42d01f05',
  '{"ru":"Пятьдесят внешних публикаций","en":"Fifty external publications"}'::jsonb,
  '{"ru":"Стань постоянным голосом Open Abundance и собери пятьдесят одобренных материалов.","en":"Become a steady voice of Open Abundance and reach fifty approved pieces."}'::jsonb,
  source.instructions,
  '{"ru":"Заверши предыдущий milestone и набери 50 одобренных публикаций.","en":"Complete the previous milestone and reach 50 approved publications."}'::jsonb,
  source.category, 5, 90, source.verification_type, source.verification_logic,
  204, source.track_key, 5, '55bb0d7b-ef78-46f8-9c02-c8ba42d01f04',
  source.action_view, source.acquisition_series, 50, source.acquisition_metric_key,
  5, 0, true
from public.challenges source
where source.id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f04'
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    requirements = excluded.requirements,
    acquisition_target = excluded.acquisition_target,
    core_reward_amount = excluded.core_reward_amount,
    duration_days = excluded.duration_days,
    sort_order = excluded.sort_order,
    prerequisite_challenge_id = excluded.prerequisite_challenge_id;
