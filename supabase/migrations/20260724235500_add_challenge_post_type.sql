-- Add 'challenge' post_type to feed_posts check constraint

alter table public.feed_posts
  drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
  add constraint feed_posts_post_type_check
  check (post_type in ('daily_progress', 'manual', 'external_link', 'wish', 'reality_demo', 'system_story', 'challenge'));