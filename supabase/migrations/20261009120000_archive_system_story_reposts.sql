-- Reposts of the system stories appeared in the feed as duplicate tiles with the same title.
-- Archive the existing ones; rows are kept so links and comments remain valid.
update public.feed_posts
set status = 'archived',
    updated_at = now()
where source_key like 'canonical-repost:a1800000-0000-4000-8000-%'
  and status = 'published';
