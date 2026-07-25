-- Feed categories, renamed editorial stories, and system-event covers.

alter table public.feed_posts
  drop constraint if exists feed_posts_post_type_check;

update public.feed_posts
set post_type = 'abundance_story', updated_at = now()
where post_type = 'system_story';

update public.feed_posts
set post_type = 'wish_completed', updated_at = now()
where post_type = 'manual'
  and source_key like 'wish-completed:%';

alter table public.feed_posts
  add constraint feed_posts_post_type_check
  check (post_type in (
    'daily_progress',
    'level_up',
    'manual',
    'external_link',
    'wish',
    'wish_completed',
    'reality_demo',
    'abundance_story',
    'challenge',
    'project_review'
  ));

create index if not exists feed_posts_type_status_created_idx
on public.feed_posts (post_type, status, created_at desc)
where deleted_at is null;

alter table public.feed_post_media
  add column if not exists storage_path text;

alter table public.feed_post_media
  alter column media_url drop not null;

alter table public.feed_post_media
  drop constraint if exists feed_post_media_source_check;

alter table public.feed_post_media
  add constraint feed_post_media_source_check
  check (media_url is not null or storage_path is not null);

insert into public.feed_post_media (
  post_id,
  media_type,
  media_url,
  alt_text,
  sort_order,
  metadata
)
select
  post.id,
  'image',
  case post.post_type
    when 'level_up' then '/feed/system-events/level-up.png'
    when 'wish_completed' then '/feed/system-events/wish-completed.png'
    when 'challenge' then '/feed/system-events/challenge-completed.png'
    else '/feed/system-events/daily-progress.png'
  end,
  '{}'::jsonb,
  0,
  jsonb_build_object('origin', 'system_template', 'templateKey', case post.post_type
    when 'level_up' then 'level_up'
    when 'wish_completed' then 'wish_completed'
    when 'challenge' then 'challenge_completed'
    else 'daily_progress'
  end)
from public.feed_posts post
where post.post_type in ('daily_progress', 'level_up', 'wish_completed', 'challenge')
  and not exists (
    select 1 from public.feed_post_media media
    where media.post_id = post.id
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-media', 'feed-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Feed media can be read by visible viewers" on storage.objects;
create policy "Feed media can be read by visible viewers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'feed-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.feed_post_media media
      join public.feed_posts post on post.id = media.post_id
      where media.storage_path = storage.objects.name
        and post.deleted_at is null
        and post.status = 'published'
        and post.visibility = 'public'
    )
  )
);

drop policy if exists "Authors can upload feed media" on storage.objects;
create policy "Authors can upload feed media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Authors can update feed media" on storage.objects;
create policy "Authors can update feed media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Authors can delete feed media" on storage.objects;
create policy "Authors can delete feed media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
