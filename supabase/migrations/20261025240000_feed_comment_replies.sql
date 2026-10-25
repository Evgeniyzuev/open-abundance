-- Replies under feed comments, Reddit-style with one level: a reply always points at the top-level
-- comment of its branch (the API folds a reply-to-a-reply onto that root). Removing the parent
-- removes its replies.

alter table public.feed_post_comments
  add column if not exists parent_comment_id uuid references public.feed_post_comments(id) on delete cascade;

create index if not exists feed_post_comments_parent_idx
  on public.feed_post_comments (parent_comment_id, created_at asc)
  where parent_comment_id is not null;
