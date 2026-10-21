-- Track "business" (BIZ-001): from the first listing to the first customer who joined through the seller's link.
-- Every step is a short lesson plus a result read from the facts (listings, completed Market deals, published
-- reviews, invitations, humanity checks, shop purchases), rewarded with Core +1 (founder decision 2026-10-21).
-- Existing steps keep their own rewards and only get a track position. No prerequisites: people go at their own pace.
--
--   1 choose a direction (niche_task_chosen)   2 first listing   3 first sale   4 second buyer
--   5 three reviews   6 stranger buyer   7 buyer from your link   8-10 sales $10 / $100 / $1000   11 buy inside

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'c9a4f2d1-6b38-4e57-8a10-5d7e2f9b4c01',
  '{"ru": "Второй покупатель", "en": "Your second buyer"}'::jsonb,
  '{"ru": "Сделайте так, чтобы у вас купили двое разных людей.", "en": "Get two different people to buy from you."}'::jsonb,
  '{"ru": "Урок: повторная продажа проверяет, что предложение нужно не одному знакомому. Напишите первому покупателю и спросите, кому ещё это пригодится, покажите объявление в своём круге и ответьте всем, кто спросил.\n1. Попросите первого покупателя порекомендовать вас одному человеку.\n2. Выложите объявление там, где живёт ваша аудитория.\n3. Завершите сделку со вторым человеком и нажмите «Проверить выполнение».", "en": "Lesson: a repeat sale shows the offer is needed by more than one acquaintance. Ask your first buyer who else could use it, show the listing in your circle and answer everyone who asks.\n1. Ask your first buyer to recommend you to one person.\n2. Post the listing where your audience is.\n3. Complete a deal with a second person and press Check completion."}'::jsonb,
  '{"ru": "Завершены сделки с двумя разными покупателями.", "en": "Completed deals with two different buyers."}'::jsonb,
  'marketplace', 4, 60, 'auto', 'business_second_buyer',
  51, 'business', 4, null, 'wallet.market', 1, 0, true
),
(
  'c9a4f2d1-6b38-4e57-8a10-5d7e2f9b4c02',
  '{"ru": "Три честных отзыва", "en": "Three honest reviews"}'::jsonb,
  '{"ru": "Соберите отзывы от трёх разных покупателей.", "en": "Collect reviews from three different buyers."}'::jsonb,
  '{"ru": "Урок: отзыв — главный довод для следующего клиента. Через день после сделки напишите покупателю, спросите, что понравилось и чего не хватило, и попросите оставить отзыв в сделке. Не просите «пять звёзд» и ничего не обещайте за оценку.\n1. После каждой завершённой сделки попросите отзыв одной фразой.\n2. Исправьте то, о чём писали.\n3. Когда наберутся три отзыва от разных людей, нажмите «Проверить выполнение».", "en": "Lesson: a review is the main argument for the next customer. A day after the deal, ask the buyer what they liked and what was missing, and ask them to leave a review in the deal. Do not ask for five stars and do not promise anything for a rating.\n1. After each completed deal, ask for a review in one sentence.\n2. Fix what people mention.\n3. When three different people have reviewed, press Check completion."}'::jsonb,
  '{"ru": "Опубликованы отзывы от трёх разных покупателей.", "en": "Published reviews from three different buyers."}'::jsonb,
  'marketplace', 5, 60, 'auto', 'business_reviews_3',
  52, 'business', 5, null, 'wallet.market', 1, 0, true
),
(
  'c9a4f2d1-6b38-4e57-8a10-5d7e2f9b4c03',
  '{"ru": "Покупатель не из знакомых", "en": "A buyer you did not invite"}'::jsonb,
  '{"ru": "Продайте человеку, которого вы не приглашали и который прошёл проверку человечности.", "en": "Sell to a verified person you did not invite."}'::jsonb,
  '{"ru": "Урок: настоящий спрос начинается там, где вас не знают. Опишите, что вы продаёте, так, чтобы было понятно незнакомому человеку: кому, зачем, сколько и за какой срок. Откликнитесь на просьбы участников в вашей теме.\n1. Переписайте объявление без внутренних шуток и с ценой.\n2. Найдите просьбы участников по вашей теме и предложите помощь.\n3. Завершите сделку и нажмите «Проверить выполнение».", "en": "Lesson: real demand starts where people do not know you. Describe what you sell so a stranger understands it: for whom, why, how much and how fast. Answer members'' requests in your topic.\n1. Rewrite the listing without inside jokes and with a price.\n2. Find members'' requests on your topic and offer help.\n3. Complete a deal and press Check completion."}'::jsonb,
  '{"ru": "Есть завершённая сделка с покупателем, который прошёл проверку человечности и не связан с вами приглашением.", "en": "A completed deal with a buyer who passed the humanity check and is not linked to you by an invitation."}'::jsonb,
  'marketplace', 5, 60, 'auto', 'business_stranger_buyer',
  53, 'business', 6, null, 'wallet.market', 1, 0, true
),
(
  'c9a4f2d1-6b38-4e57-8a10-5d7e2f9b4c04',
  '{"ru": "Клиент пришёл по вашей ссылке", "en": "A customer who joined through your link"}'::jsonb,
  '{"ru": "Приведите в Open Abundance человека, который купит у вас.", "en": "Bring someone into Open Abundance who buys from you."}'::jsonb,
  '{"ru": "Урок: бизнес, который приводит людей, растит и себя, и систему. Покажите свою страницу тем, кто ещё не в OA, и честно скажите, что вы здесь делаете. Не обещайте доход и не давите.\n1. Отправьте свою ссылку человеку, которому нужно ваше предложение.\n2. Помогите ему зарегистрироваться и пройти проверку человечности.\n3. Завершите сделку и нажмите «Проверить выполнение».", "en": "Lesson: a business that brings people in grows itself and the system. Show your page to people who are not in OA yet and say honestly what you do here. Do not promise income and do not push.\n1. Send your link to someone who needs your offer.\n2. Help them sign up and pass the humanity check.\n3. Complete a deal and press Check completion."}'::jsonb,
  '{"ru": "Покупатель, пришедший по вашей ссылке и прошедший проверку человечности, завершил сделку с вами.", "en": "A buyer who joined through your link and passed the humanity check completed a deal with you."}'::jsonb,
  'marketplace', 6, 60, 'auto', 'business_external_buyer',
  54, 'business', 7, null, 'wallet.market', 1, 0, true
),
(
  'c9a4f2d1-6b38-4e57-8a10-5d7e2f9b4c05',
  '{"ru": "Перенесите одну трату внутрь", "en": "Move one purchase inside"}'::jsonb,
  '{"ru": "Купите внутри Open Abundance то, что и так собирались купить.", "en": "Buy inside Open Abundance something you were going to buy anyway."}'::jsonb,
  '{"ru": "Урок: когда вы покупаете внутри, деньги остаются в сообществе, а покупка в Лавке добавляет долю в ваш Core. Посмотрите, что вы покупаете регулярно, и проверьте, есть ли это на Маркете или в Лавке.\n1. Вспомните одну регулярную трату: обучение, услугу, подарок, шаблон.\n2. Поищите её в Wallet → Маркет или в Лавке.\n3. Купите и нажмите «Проверить выполнение».", "en": "Lesson: when you buy inside, the money stays in the community, and a Shop purchase adds a share to your Core. Look at what you buy regularly and check whether it is on the Market or in the Shop.\n1. Recall one regular expense: learning, a service, a gift, a template.\n2. Look for it in Wallet → Market or in the Shop.\n3. Buy it and press Check completion."}'::jsonb,
  '{"ru": "Есть завершённая покупка на Маркете или покупка в Лавке.", "en": "A completed Market purchase or a Shop purchase exists."}'::jsonb,
  'marketplace', 2, 60, 'auto', 'first_internal_purchase',
  55, 'business', 11, null, 'wallet.market', 1, 0, true
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
    track_key = excluded.track_key,
    track_step = excluded.track_step,
    prerequisite_challenge_id = excluded.prerequisite_challenge_id,
    action_view = excluded.action_view,
    core_reward_amount = excluded.core_reward_amount,
    wallet_reward_amount = excluded.wallet_reward_amount,
    is_active = excluded.is_active;

-- Positions of the steps that already exist (their text and rewards stay as they are).
update public.challenges set track_key = 'business', track_step = 1 where id = '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a01';
update public.challenges set track_key = 'business', track_step = 2 where id = '6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a02';
update public.challenges set track_key = 'business', track_step = 3 where id = 'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e20';
update public.challenges set track_key = 'business', track_step = 8 where id = 'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e21';
update public.challenges set track_key = 'business', track_step = 9 where id = 'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e22';
update public.challenges set track_key = 'business', track_step = 10 where id = 'b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e23';
