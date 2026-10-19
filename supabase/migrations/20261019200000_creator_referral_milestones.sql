-- "Author from scratch", version 1: referral milestones in sequence. The people are counted from the facts
-- (invited people who passed the humanity check), the rewards are founder-approved starting values (2026-10-19)
-- and live in the rows below, so they can change without code. The money for each invited person is paid
-- immediately by the referral program; these steps only add milestone bonuses.
--
--   1 confirmed invited person    badge only (opens the next step)
--   10 confirmed                  Core +5
--   50 confirmed ("first $100")   Core +20
--   100 confirmed                 Core +50

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values
(
  'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b01',
  '{"ru":"Первый подтверждённый приглашённый","en":"Your first confirmed invitee"}'::jsonb,
  '{"ru":"Приведите первого человека, который прошёл проверку человечности. За него вы получите награду сразу.","en":"Bring your first person who passed the humanity check. You get the reward for them right away."}'::jsonb,
  '{"ru":"1. Снимите короткое видео или напишите пост о том, зачем вы здесь (формула: крючок, что вы делаете, честная цифра дня, ссылка в профиле).\n2. Выложите его в TikTok, YouTube Shorts и Instagram Reels в один день, а текстовую версию в X, Telegram или Binance Square.\n3. Поставьте свою ссылку /@ник?ref=… в шапку профиля и под пост.\n4. Не обещайте доход и проценты: рассказывайте, что делаете и что получилось.\n5. Когда приглашённый пройдёт проверку человечности, награда придёт сама, а здесь нажмите «Проверить выполнение».","en":"1. Record a short video or write a post about why you are here (hook, what you do, an honest number of the day, the link in your profile).\n2. Post it to TikTok, YouTube Shorts and Instagram Reels on the same day, and a text version to X, Telegram or Binance Square.\n3. Put your /@nick?ref=… link in your profile header and under the post.\n4. Do not promise income or interest: tell what you do and what came out.\n5. When an invited person passes the humanity check, the reward arrives by itself; press Check completion here."}'::jsonb,
  '{"ru":"Хотя бы один приглашённый вами человек подтвердил, что он человек.","en":"At least one person you invited confirmed they are a person."}'::jsonb,
  'social', 1, 90, 'auto', 'referrals_confirmed_1',
  40, 'creator', 1, null, 'people.profile', 0, 0, true
),
(
  'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b02',
  '{"ru":"10 подтверждённых приглашённых","en":"10 confirmed invitees"}'::jsonb,
  '{"ru":"Приведите десять человек, которые прошли проверку человечности. Бонус придёт сразу, как наберётся десятый.","en":"Bring ten people who passed the humanity check. The bonus arrives as soon as the tenth is confirmed."}'::jsonb,
  '{"ru":"1. Публикуйте каждый день, лучше в одно время: снимите три ролика за раз и выкладывайте по одному.\n2. Один ролик выкладывайте в три места: TikTok, YouTube Shorts, Instagram Reels.\n3. Отвечайте на каждый комментарий в первый час и ссылайтесь на страницу /guide.\n4. Не покупайте подписчиков и просмотры и не кидайте ссылку в чужие чаты: так вы теряете охват.\n5. В подписи указывайте, что вы участник Open Abundance и получаете награду за приглашённых.","en":"1. Post every day, ideally at the same time: record three videos at once and publish one a day.\n2. Post one video in three places: TikTok, YouTube Shorts, Instagram Reels.\n3. Answer every comment in the first hour and point to the /guide page.\n4. Do not buy followers or views and do not drop your link into other people''s chats: you lose reach that way.\n5. State in the caption that you are an Open Abundance member and get a reward for invitees."}'::jsonb,
  '{"ru":"Десять приглашённых вами людей подтвердили, что они люди.","en":"Ten people you invited confirmed they are people."}'::jsonb,
  'social', 1, 180, 'auto', 'referrals_confirmed_10',
  41, 'creator', 2, 'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b01', 'people.profile', 5, 0, true
),
(
  'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b03',
  '{"ru":"Первые $100: 50 подтверждённых","en":"First $100: 50 confirmed invitees"}'::jsonb,
  '{"ru":"Пятьдесят подтверждённых людей по $2 за каждого — это первые $100 только от приглашений, плюс бонус за рубеж.","en":"Fifty confirmed people at $2 each is the first $100 from invitations alone, plus the milestone bonus."}'::jsonb,
  '{"ru":"1. Снимайте «Реалити роста»: день N, что сделали, что получили, что не вышло, что дальше. Цифры берите из приложения.\n2. Раз в неделю делайте пост-итог с честными цифрами, включая неудачи.\n3. Смотрите, что приносит людей: много просмотров и мало переходов значит поменять призыв, много переходов и мало регистраций значит улучшить страницу профиля.\n4. Помогайте новичкам из своей команды пройти первые шаги: подтверждённых становится больше.","en":"1. Film Reality of growth: day N, what you did, what you got, what failed, what next. Take the numbers from the app.\n2. Once a week post a recap with honest numbers, including failures.\n3. Watch what brings people: many views and few clicks means change the call to action, many clicks and few sign-ups means improve your profile page.\n4. Help newcomers in your team through their first steps: more people get confirmed."}'::jsonb,
  '{"ru":"Пятьдесят приглашённых вами людей подтвердили, что они люди.","en":"Fifty people you invited confirmed they are people."}'::jsonb,
  'social', 2, 365, 'auto', 'referrals_confirmed_50',
  42, 'creator', 3, 'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b02', 'people.profile', 20, 0, true
),
(
  'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b04',
  '{"ru":"100 подтверждённых приглашённых","en":"100 confirmed invitees"}'::jsonb,
  '{"ru":"Сто подтверждённых людей: вы строите собственную аудиторию внутри Open Abundance.","en":"One hundred confirmed people: you are building your own audience inside Open Abundance."}'::jsonb,
  '{"ru":"1. Продолжайте то, что работает, и добавляйте новые площадки: X, Telegram, Binance Square, VK.\n2. Показывайте истории других участников с их согласия.\n3. Помогайте новым авторам начать: их подтверждённые тоже растут.\n4. Юридические вопросы своей страны (маркировка рекламы, налоги) решаете вы сами; Нова подскажет по частым вопросам.","en":"1. Keep doing what works and add new platforms: X, Telegram, Binance Square, VK.\n2. Show other members'' stories with their consent.\n3. Help new authors start: their confirmed people grow too.\n4. You handle the legal questions of your own country (ad marking, taxes) yourself; Nova can answer the common ones."}'::jsonb,
  '{"ru":"Сто приглашённых вами людей подтвердили, что они люди.","en":"One hundred people you invited confirmed they are people."}'::jsonb,
  'social', 2, 365, 'auto', 'referrals_confirmed_100',
  43, 'creator', 4, 'e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b03', 'people.profile', 50, 0, true
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
