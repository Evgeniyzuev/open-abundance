-- User Content Growth Loop: first-party manual posts, canonical reposts, likes and flat comments.

alter table public.feed_posts
  add column if not exists repost_of_post_id uuid references public.feed_posts(id) on delete set null;

create index if not exists feed_posts_repost_of_post_idx
on public.feed_posts (repost_of_post_id)
where repost_of_post_id is not null;

create unique index if not exists feed_posts_author_repost_unique_idx
on public.feed_posts (author_user_id, repost_of_post_id)
where repost_of_post_id is not null and deleted_at is null;

create table if not exists public.feed_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists feed_post_likes_post_created_idx
on public.feed_post_likes (post_id, created_at desc);

create table if not exists public.feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  client_idempotency_key text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_idempotency_key)
);

create index if not exists feed_post_comments_post_created_idx
on public.feed_post_comments (post_id, created_at asc)
where deleted_at is null;

alter table public.feed_post_likes enable row level security;
alter table public.feed_post_comments enable row level security;

grant select, insert, delete on table public.feed_post_likes to authenticated, service_role;
grant select, insert, update, delete on table public.feed_post_comments to authenticated, service_role;

drop policy if exists "Users can read likes on visible feed posts" on public.feed_post_likes;
create policy "Users can read likes on visible feed posts"
on public.feed_post_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_likes.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (post.status = 'published' and post.visibility = 'public')
      )
  )
);

drop policy if exists "Users can like visible feed posts" on public.feed_post_likes;
create policy "Users can like visible feed posts"
on public.feed_post_likes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_likes.post_id
      and post.deleted_at is null
      and post.status = 'published'
      and post.visibility = 'public'
  )
);

drop policy if exists "Users can remove own feed likes" on public.feed_post_likes;
create policy "Users can remove own feed likes"
on public.feed_post_likes
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read comments on visible feed posts" on public.feed_post_comments;
create policy "Users can read comments on visible feed posts"
on public.feed_post_comments
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_comments.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (post.status = 'published' and post.visibility = 'public')
      )
  )
);

drop policy if exists "Users can comment on visible feed posts" on public.feed_post_comments;
create policy "Users can comment on visible feed posts"
on public.feed_post_comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_comments.post_id
      and post.deleted_at is null
      and post.status = 'published'
      and post.visibility = 'public'
  )
);

drop policy if exists "Users can update own feed comments" on public.feed_post_comments;
create policy "Users can update own feed comments"
on public.feed_post_comments
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own feed comments" on public.feed_post_comments;
create policy "Users can delete own feed comments"
on public.feed_post_comments
for delete
to authenticated
using (user_id = (select auth.uid()));

drop trigger if exists touch_feed_post_comments_updated_at on public.feed_post_comments;
create trigger touch_feed_post_comments_updated_at
before update on public.feed_post_comments
for each row
execute function public.touch_updated_at();

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
where id = 'feed-media';
