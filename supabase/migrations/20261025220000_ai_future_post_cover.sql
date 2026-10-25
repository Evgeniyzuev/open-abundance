-- Cover image for the "The future with AI" discussion post (challenge:ai_future). The post was seeded in
-- 20261023140000_ai_essay_challenge.sql without a feed_post_media row, so the feed showed it as text only.
-- The file lives in public/feed/editorial-stories/; it is a vector illustration drawn for this post.

insert into public.feed_post_media (post_id, media_type, media_url, alt_text, source_url, source_label, sort_order, metadata)
values (
  'a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e01',
  'image',
  '/feed/editorial-stories/ai-future-choice.jpg',
  '{"ru":"Человек и дружелюбный робот стоят на развилке: одна дорога ведёт к солнечному саду с деревом, домами и людьми, другая к тёмным башням под надзирающим глазом","en":"A person and a friendly robot stand at a fork: one road leads to a sunny garden with a tree, homes and people, the other to dark towers under a watching eye"}'::jsonb,
  null,
  'Illustration',
  0,
  '{"origin":"illustration","use_case":"challenge-discussion-cover","aspect_ratio":"4:5","generated_at":"2026-10-25"}'::jsonb
)
on conflict (post_id, sort_order) do update set
  media_url = excluded.media_url,
  alt_text = excluded.alt_text,
  source_label = excluded.source_label,
  metadata = excluded.metadata,
  updated_at = now();
