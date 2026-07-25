-- Add system_verified column to feed_posts for verified Challenge Done posts

alter table public.feed_posts
  add column if not exists system_verified boolean not null default false;
-- Add index for filtering verified posts
create index if not exists feed_posts_system_verified_idx
  on public.feed_posts (system_verified)
  where system_verified = true;
