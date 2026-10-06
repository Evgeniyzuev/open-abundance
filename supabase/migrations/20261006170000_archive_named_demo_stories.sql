-- Archive the fictional named "demo story" testimonials. Editorial stories signed by
-- the Open Abundance editorial team replace them in the pilot feed. Rows are kept
-- (status 'archived') so existing links, comments and wish references stay valid.
update public.feed_posts
set status = 'archived',
    updated_at = now()
where post_type = 'reality_demo'
  and status = 'published';
