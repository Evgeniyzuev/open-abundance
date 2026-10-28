-- Quest "Tell how it was for you": the person tells their own experience under someone else's story, and the quest
-- is done once three other people mark that comment as useful (▲). Checked in app/api/challenges/check/route.ts
-- (lib/storyComments.ts). Evgen (2026-10-28): part of a useful result goes straight to Wallet; $0.7 Core + $0.3 Wallet
-- keeps the total at $1, so the quest is open before «Я не робот».

insert into public.challenges (
  id, title, description, instructions, requirements, category,
  difficulty_level, duration_days, verification_type, verification_logic,
  sort_order, track_key, track_step, prerequisite_challenge_id,
  action_view, core_reward_amount, wallet_reward_amount, is_active
) values (
  'f5c0a7e1-3b2d-4c6e-9a10-5d7e8f9a0b11',
  '{"ru":"Расскажи, как у тебя было","en":"Tell how it was for you"}'::jsonb,
  '{"ru":"Под чужой историей расскажи свой похожий опыт. Когда три человека отметят твой рассказ как полезный (▲), задание засчитается.","en":"Under someone else''s story, tell your own similar experience. When three people mark it as useful (▲), the quest counts."}'::jsonb,
  '{"ru":"1. Открой ленту и выбери историю, которая про тебя.\n2. Ответь на вопрос Новы под ней: что было у тебя, что помогло или что мешает. Два-три предложения, своими словами.\n3. Отвечай тем, кто напишет тебе: живой разговор чаще отмечают как полезный.\n4. Когда три человека поставят ▲, нажми «Проверить выполнение».","en":"1. Open the feed and pick a story that is about you.\n2. Answer Nova''s question under it: what happened to you, what helped or what is in the way. Two or three sentences in your own words.\n3. Reply to people who answer you: a live conversation is marked useful more often.\n4. When three people give it ▲, press Check completion."}'::jsonb,
  '{"ru":"Твой комментарий под чужим постом (не ответ, от 60 знаков) отметили ▲ три других человека.","en":"Your comment under someone else''s post (not a reply, 60+ characters) got ▲ from three other people."}'::jsonb,
  'social', 1, 30, 'auto', 'story_comment_useful',
  30, null, null, null, 'people.feed', 0.7, 0.3, true
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
    wallet_reward_amount = excluded.wallet_reward_amount,
    is_active = excluded.is_active;
