-- Isolated hotlink experiment for the first Abundance System story.
-- Keep the previous licensed Unsplash URL in metadata for a simple rollback.

update public.feed_post_media as media
set
  media_url = 'https://i.pinimg.com/736x/0b/3b/03/0b3b03f620b75390926bb96a850d3a04.jpg',
  source_url = 'https://i.pinimg.com/736x/0b/3b/03/0b3b03f620b75390926bb96a850d3a04.jpg',
  source_label = 'Pinterest test',
  metadata = coalesce(media.metadata, '{}'::jsonb) || jsonb_build_object(
    'media_experiment', 'pinterest_hotlink_2026-07-24',
    'previous_media_url', media.media_url,
    'previous_source_url', media.source_url,
    'previous_source_label', media.source_label
  )
where media.post_id = 'a1800000-0000-4000-8000-000000000001'::uuid
  and media.media_type = 'image'
  and media.sort_order = 0;
