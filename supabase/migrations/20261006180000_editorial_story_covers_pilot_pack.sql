-- Cover images for the eight pilot editorial stories. Files live in
-- public/feed/editorial-stories/. Images are AI-generated illustrations in a
-- realistic photographic style, recorded as such in the media metadata.

insert into public.feed_post_media (
  post_id,
  media_type,
  media_url,
  alt_text,
  source_url,
  source_label,
  sort_order,
  metadata
)
values
  (
    'a1700000-0000-4000-8000-000000000029',
    'image',
    '/feed/editorial-stories/what-is-easy.jpg',
    '{"ru":"Женщина за кухонным столом вечером задумчиво смотрит в окно рядом с распечаткой с правками и ноутбуком","en":"A woman at a kitchen table in the evening gazes thoughtfully out of the window beside a marked-up printout and a laptop"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"4:5","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-00000000002a',
    'image',
    '/feed/editorial-stories/first-listing.jpg',
    '{"ru":"Руки держат смартфон над деревянным столом с блокнотом и чашкой, за окном закат","en":"Hands holding a smartphone over a wooden desk with a notebook and a mug, sunset behind the window"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"4:5","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-00000000002b',
    'image',
    '/feed/editorial-stories/one-dollar-a-day.jpg',
    '{"ru":"Мужчина опускает монету в стеклянную банку с монетами и купюрами рядом с блокнотом на кухне","en":"A man drops a coin into a glass jar of coins and bills next to a notebook in a kitchen"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"4:5","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-00000000002c',
    'image',
    '/feed/editorial-stories/three-steps-to-move.jpg',
    '{"ru":"Пара за столом изучает карту города с тремя цветными стикерами, позади коробки для переезда","en":"A couple at a table studies a city map with three coloured sticky notes, moving boxes behind them"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"4:5","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-00000000002d',
    'image',
    '/feed/editorial-stories/route-by-steps.jpg',
    '{"ru":"Стол у окна с атласом, паспортом, календарём и рюкзаком, рука записывает план поездки в блокнот","en":"A desk by a window with an atlas, passport, calendar and backpack, a hand writing a trip plan in a notebook"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"4:5","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-00000000002e',
    'image',
    '/feed/editorial-stories/first-thousand-lesson.jpg',
    '{"ru":"Мужчина вечером на диване с ноутбуком на коленях при свете лампы","en":"A man on a sofa in the evening with a laptop on his knees by lamplight"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"2:3","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-00000000002f',
    'image',
    '/feed/editorial-stories/coming-back.jpg',
    '{"ru":"Женщина у окна в закатном свете держит телефон, рядом чашка чая и растение","en":"A woman by a window in sunset light holds her phone, with a cup of tea and a plant nearby"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"2:3","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  ),
  (
    'a1700000-0000-4000-8000-000000000030',
    'image',
    '/feed/editorial-stories/neighbour-and-phone.jpg',
    '{"ru":"Молодой человек и пожилой сосед сидят рядом на скамье и вместе смотрят в смартфон","en":"A young man and an older neighbour sit side by side on a bench looking at a smartphone together"}'::jsonb,
    null,
    'AI-generated image',
    0,
    '{"origin":"ai_generated","use_case":"editorial-story-cover","aspect_ratio":"2:3","style":"realistic smartphone photo","generated_at":"2026-10-06"}'::jsonb
  )
on conflict (post_id, sort_order) do update
set
  media_type = excluded.media_type,
  media_url = excluded.media_url,
  alt_text = excluded.alt_text,
  source_label = excluded.source_label,
  metadata = excluded.metadata;
