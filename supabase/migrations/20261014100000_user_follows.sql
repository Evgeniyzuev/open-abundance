-- Followers: one row per (follower, followee). Writes go through the server API (service role);
-- signed-in users can read only rows where they are one of the two sides. Counts are computed from the
-- followee index; no denormalized counter is kept.

create table if not exists public.user_follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followee_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followee_user_id),
  constraint user_follows_not_self check (follower_user_id <> followee_user_id)
);

create index if not exists user_follows_followee_idx
  on public.user_follows (followee_user_id, created_at desc);

alter table public.user_follows enable row level security;

revoke all on table public.user_follows from anon, authenticated;
grant select on table public.user_follows to authenticated;

drop policy if exists user_follows_select_own on public.user_follows;
create policy user_follows_select_own on public.user_follows
  for select to authenticated
  using ((select auth.uid()) = follower_user_id or (select auth.uid()) = followee_user_id);
