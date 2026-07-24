-- Verified Challenge Done: server-backed read model for challenge completion snapshots
-- One snapshot per user per challenge completion, no reward/ledger data

create table if not exists public.challenge_completion_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  challenge_title jsonb not null,
  challenge_category text,
  verification_type text,
  completed_at timestamptz not null,
  feed_post_id uuid references public.feed_posts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create index if not exists challenge_completion_snapshots_user_id_idx
  on public.challenge_completion_snapshots (user_id);
create index if not exists challenge_completion_snapshots_challenge_id_idx
  on public.challenge_completion_snapshots (challenge_id);

alter table public.challenge_completion_snapshots enable row level security;

-- Users can read their own snapshots
create policy "Users can read own challenge completion snapshots"
  on public.challenge_completion_snapshots
  for select
  to authenticated
  using (user_id = auth.uid());

-- Insert/update only through service_role
revoke all on table public.challenge_completion_snapshots from public, anon, authenticated;
grant select on table public.challenge_completion_snapshots to authenticated;
grant insert, update on table public.challenge_completion_snapshots to service_role;

-- Function to create a verified Challenge Done post and snapshot
create or replace function public.create_verified_challenge_post(
  p_user_id uuid,
  p_challenge_id uuid,
  p_challenge_title jsonb,
  p_challenge_category text,
  p_verification_type text
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_feed_post_id uuid;
  v_snapshot_id uuid;
  v_now timestamptz := now();
  v_body_ru text;
  v_body_en text;
  v_challenge_title_ru text;
  v_challenge_title_en text;
begin
  -- Check if snapshot already exists (idempotent)
  select id into v_existing_id
  from public.challenge_completion_snapshots
  where user_id = p_user_id and challenge_id = p_challenge_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object('snapshot_id', v_existing_id, 'created', false);
  end if;

  -- Extract localized titles
  v_challenge_title_ru := p_challenge_title->>'ru';
  v_challenge_title_en := p_challenge_title->>'en';
  if v_challenge_title_ru is null then
    v_challenge_title_ru := p_challenge_title->>'en';
  end if;
  if v_challenge_title_en is null then
    v_challenge_title_en := p_challenge_title->>'ru';
  end if;
  if v_challenge_title_ru is null then
    v_challenge_title_ru := 'Challenge completed';
  end if;
  if v_challenge_title_en is null then
    v_challenge_title_en := 'Challenge completed';
  end if;

  v_body_ru := 'Я завершил(а) "' || v_challenge_title_ru || '"! 🎉' || E'\n\n' ||
               'Этот результат подтверждён системой Open Abundance. ' ||
               'Каждый шаг приближает меня к моим желаниям.';

  v_body_en := 'I completed "' || v_challenge_title_en || '"! 🎉' || E'\n\n' ||
               'This result is verified by Open Abundance. ' ||
               'Every step brings me closer to my wishes.';

  -- Create feed post
  insert into public.feed_posts (
    author_user_id,
    post_type,
    status,
    visibility,
    body,
    system_verified,
    published_at,
    created_at,
    updated_at
  ) values (
    p_user_id,
    'challenge',
    'published',
    'public',
    v_body_ru,
    true,
    v_now,
    v_now,
    v_now
  ) returning id into v_feed_post_id;

  -- Add English translation
  begin
    insert into public.feed_post_translations (post_id, locale, body)
    values (v_feed_post_id, 'en', v_body_en);
  exception when others then
    -- translation table may not exist yet, ignore
  end;

  -- Create stat blocks
  begin
    insert into public.feed_post_stat_blocks (post_id, snapshot_id, block_key, label, value, visibility, sort_order)
    values
      (v_feed_post_id, null, 'challenge', '{"ru":"Челлендж","en":"Challenge"}'::jsonb, to_jsonb(v_challenge_title_ru), 'public'::text, 0);
  exception when others then
    -- stat blocks table may not have snapshot_id column, try without it
    begin
      insert into public.feed_post_stat_blocks (post_id, block_key, label, value, visibility, sort_order)
      values
        (v_feed_post_id, 'challenge', '{"ru":"Челлендж","en":"Challenge"}'::jsonb, to_jsonb(v_challenge_title_ru), 'public'::text, 0);
    exception when others then
      null;
    end;
  end;

  -- Create snapshot
  insert into public.challenge_completion_snapshots (
    user_id,
    challenge_id,
    challenge_title,
    challenge_category,
    verification_type,
    completed_at,
    feed_post_id,
    created_at
  ) values (
    p_user_id,
    p_challenge_id,
    p_challenge_title,
    p_challenge_category,
    p_verification_type,
    v_now,
    v_feed_post_id,
    v_now
  ) returning id into v_snapshot_id;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'feed_post_id', v_feed_post_id,
    'created', true
  );
end;
$$;

revoke all on function public.create_verified_challenge_post(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_verified_challenge_post(uuid, uuid, jsonb, text, text) to service_role;