-- Shared external content reuses feed posts and remains private until published.

alter table public.feed_posts
  add column if not exists title text;

alter table public.feed_posts
  add constraint feed_posts_title_length_check
  check (title is null or char_length(title) <= 120);

alter table public.feed_post_external_links
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists normalized_url text,
  add column if not exists description text,
  add column if not exists author_name text,
  add column if not exists canonical_url text,
  add column if not exists metadata_status text not null default 'link_only';

with legacy_source_links as (
  select
    source.id,
    post.author_user_id as owner_user_id,
    source.external_url,
    row_number() over (partition by post.author_user_id, source.external_url order by source.created_at, source.id) as duplicate_rank
  from public.feed_post_external_links source
  join public.feed_posts post on post.id = source.post_id
  where source.relation = 'source'
    and source.owner_user_id is null
    and post.post_type = 'external_link'
    and post.author_user_id is not null
    and post.deleted_at is null
)
update public.feed_post_external_links source
set owner_user_id = legacy.owner_user_id,
    normalized_url = case when legacy.duplicate_rank = 1 then legacy.external_url else null end
from legacy_source_links legacy
where source.id = legacy.id;

update public.feed_post_external_links source
set normalized_url = null
from public.feed_posts post
where post.id = source.post_id
  and post.deleted_at is not null
  and source.relation = 'source';

alter table public.feed_post_external_links
  add constraint feed_post_external_links_metadata_status_check
  check (metadata_status in ('pending', 'ready', 'link_only', 'failed'));

create unique index if not exists feed_post_external_links_owner_url_unique_idx
  on public.feed_post_external_links (owner_user_id, normalized_url)
  where owner_user_id is not null and normalized_url is not null and relation = 'source';

create table if not exists public.feed_post_access (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (post_id, recipient_user_id)
);

create index if not exists feed_post_access_recipient_idx
  on public.feed_post_access (recipient_user_id, created_at desc)
  where revoked_at is null;

alter table public.feed_post_access enable row level security;
grant select, insert, update, delete on public.feed_post_access to authenticated, service_role;

create policy "Users can read content access they are part of"
  on public.feed_post_access for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or granted_by_user_id = (select auth.uid())
  );

create policy "Owners can grant content access"
  on public.feed_post_access for insert to authenticated
  with check (
    granted_by_user_id = (select auth.uid())
    and exists (
      select 1 from public.feed_posts post
      where post.id = feed_post_access.post_id
        and post.author_user_id = (select auth.uid())
        and post.deleted_at is null
    )
  );

create policy "Owners can revoke content access"
  on public.feed_post_access for update to authenticated
  using (
    exists (
      select 1 from public.feed_posts post
      where post.id = feed_post_access.post_id
        and post.author_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.feed_posts post
      where post.id = feed_post_access.post_id
        and post.author_user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.feed_post_access from authenticated;

create table if not exists public.feed_post_wish_links (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  wish_id uuid not null references public.wishes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_idempotency_key uuid,
  created_at timestamptz not null default now(),
  primary key (post_id, wish_id)
);

create unique index if not exists feed_post_wish_links_owner_idempotency_unique_idx
  on public.feed_post_wish_links (owner_user_id, client_idempotency_key)
  where client_idempotency_key is not null;

alter table public.feed_post_wish_links enable row level security;
grant select, insert, delete on public.feed_post_wish_links to authenticated, service_role;

create policy "Users can read own wish content links"
  on public.feed_post_wish_links for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or exists (
      select 1 from public.wishes wish
      where wish.id = feed_post_wish_links.wish_id
        and wish.owner_user_id = (select auth.uid())
        and wish.deleted_at is null
    )
  );

create policy "Users can link their own content and wishes"
  on public.feed_post_wish_links for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.feed_posts post
      where post.id = feed_post_wish_links.post_id
        and post.author_user_id = (select auth.uid())
        and post.deleted_at is null
    )
    and exists (
      select 1 from public.wishes wish
      where wish.id = feed_post_wish_links.wish_id
        and wish.owner_user_id = (select auth.uid())
        and wish.deleted_at is null
    )
  );

create policy "Users can unlink their own content and wishes"
  on public.feed_post_wish_links for delete to authenticated
  using (owner_user_id = (select auth.uid()));

alter table public.direct_messages
  add column if not exists content_post_id uuid references public.feed_posts(id) on delete set null,
  add column if not exists client_idempotency_key uuid;

create unique index if not exists direct_messages_sender_idempotency_unique_idx
  on public.direct_messages (sender_user_id, client_idempotency_key)
  where client_idempotency_key is not null;

drop policy if exists "Users can read visible feed posts" on public.feed_posts;
create policy "Users can read visible feed posts"
on public.feed_posts
for select
to authenticated
using (
  deleted_at is null
  and (
    (select auth.uid()) = author_user_id
    or (status = 'published' and visibility = 'public')
    or exists (
      select 1 from public.feed_post_access access
      where access.post_id = feed_posts.id
        and access.recipient_user_id = (select auth.uid())
        and access.revoked_at is null
    )
  )
);

drop policy if exists "Users can read visible feed external links" on public.feed_post_external_links;
create policy "Users can read visible feed external links"
on public.feed_post_external_links
for select
to authenticated
using (
  exists (
    select 1 from public.feed_posts post
    where post.id = feed_post_external_links.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (post.status = 'published' and post.visibility = 'public')
        or exists (
          select 1 from public.feed_post_access access
          where access.post_id = post.id
            and access.recipient_user_id = (select auth.uid())
            and access.revoked_at is null
        )
      )
  )
);

drop policy if exists "Users can read visible feed media" on public.feed_post_media;
create policy "Users can read visible feed media"
on public.feed_post_media
for select
to authenticated
using (
  exists (
    select 1 from public.feed_posts post
    where post.id = feed_post_media.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (post.status = 'published' and post.visibility = 'public')
        or exists (
          select 1 from public.feed_post_access access
          where access.post_id = post.id
            and access.recipient_user_id = (select auth.uid())
            and access.revoked_at is null
        )
      )
  )
);

-- Membership is managed by server routes with the service role; clients must not
-- be able to add themselves to an arbitrary conversation.
revoke insert, update on public.direct_conversation_participants from authenticated;

create or replace function public.create_saved_external_content(
  p_owner_user_id uuid,
  p_source_url text,
  p_normalized_url text,
  p_provider text,
  p_external_post_id text,
  p_author_handle text,
  p_source_title text,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  select source.post_id into v_post_id
  from public.feed_post_external_links source
  join public.feed_posts post on post.id = source.post_id and post.deleted_at is null
  where source.owner_user_id = p_owner_user_id
    and source.normalized_url = p_normalized_url
    and source.relation = 'source';

  if v_post_id is not null then
    return v_post_id;
  end if;

  insert into public.feed_posts (author_user_id, post_type, status, visibility, title, body)
  values (p_owner_user_id, 'external_link', 'draft', 'private', left(nullif(btrim(p_title), ''), 120), null)
  returning id into v_post_id;

  insert into public.feed_post_external_links (
    post_id, provider, external_url, external_post_id, author_handle, title,
    embed_status, relation, owner_user_id, normalized_url, metadata_status
  ) values (
    v_post_id, p_provider, p_source_url, p_external_post_id, p_author_handle,
    left(nullif(btrim(p_source_title), ''), 240), 'link_only', 'source', p_owner_user_id,
    p_normalized_url, 'pending'
  )
  on conflict (owner_user_id, normalized_url)
    where owner_user_id is not null and normalized_url is not null and relation = 'source'
  do nothing;

  if not found then
    delete from public.feed_posts where id = v_post_id;
    select source.post_id into v_post_id
    from public.feed_post_external_links source
    join public.feed_posts post on post.id = source.post_id and post.deleted_at is null
    where source.owner_user_id = p_owner_user_id
      and source.normalized_url = p_normalized_url
      and source.relation = 'source';
  end if;

  return v_post_id;
end;
$$;

revoke all on function public.create_saved_external_content(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_saved_external_content(uuid, text, text, text, text, text, text, text) to service_role;

create or replace function public.share_saved_content_message(
  p_sender_user_id uuid,
  p_target_user_id uuid,
  p_post_id uuid,
  p_body text,
  p_client_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_conversation_key text;
  v_existing_count bigint;
  v_is_contact boolean;
  v_existing_post_id uuid;
  v_existing_conversation_key text;
begin
  if p_sender_user_id = p_target_user_id or p_client_idempotency_key is null then
    raise exception 'Invalid recipient or idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sender_user_id::text || ':' || p_client_idempotency_key::text, 0));

  v_conversation_key := least(p_sender_user_id::text, p_target_user_id::text) || ':' || greatest(p_sender_user_id::text, p_target_user_id::text);
  select message.id, message.content_post_id, conversation.conversation_key
    into v_message_id, v_existing_post_id, v_existing_conversation_key
  from public.direct_messages message
  join public.direct_conversations conversation on conversation.id = message.conversation_id
  where message.sender_user_id = p_sender_user_id
    and message.client_idempotency_key = p_client_idempotency_key;
  if v_message_id is not null then
    if v_existing_post_id is distinct from p_post_id or v_existing_conversation_key is distinct from v_conversation_key then
      raise exception 'Idempotency key was already used for another message';
    end if;
    return v_message_id;
  end if;

  if not exists (
    select 1 from public.feed_posts post
    where post.id = p_post_id
      and post.author_user_id = p_sender_user_id
      and post.post_type = 'external_link'
      and post.deleted_at is null
  ) then
    raise exception 'Saved material not found';
  end if;

  if not exists (
    select 1 from public.user_profiles profile
    where profile.user_id = p_target_user_id and profile.deleted_at is null
  ) then
    raise exception 'Recipient not found';
  end if;

  select exists (
    select 1 from public.user_contacts contact
    where contact.owner_user_id = p_sender_user_id
      and contact.contact_user_id = p_target_user_id
      and contact.status = 'active'
  ) into v_is_contact;

  select count(*) into v_existing_count
  from public.direct_messages message
  where message.sender_user_id = p_sender_user_id
    and message.created_at >= now() - interval '1 hour';
  if (v_is_contact and v_existing_count >= 60) or (not v_is_contact and v_existing_count >= 20) then
    raise exception 'Message limit reached';
  end if;

  insert into public.direct_conversations (conversation_type, conversation_key, created_by_user_id)
  values ('direct', v_conversation_key, p_sender_user_id)
  on conflict (conversation_key) do update set updated_at = public.direct_conversations.updated_at
  returning id into v_conversation_id;

  insert into public.direct_conversation_participants (conversation_id, user_id)
  values (v_conversation_id, p_sender_user_id), (v_conversation_id, p_target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  insert into public.feed_post_access (post_id, recipient_user_id, granted_by_user_id, revoked_at)
  values (p_post_id, p_target_user_id, p_sender_user_id, null)
  on conflict (post_id, recipient_user_id) do update
    set granted_by_user_id = excluded.granted_by_user_id, revoked_at = null;

  insert into public.direct_messages (
    conversation_id, sender_user_id, body, status, content_post_id, client_idempotency_key
  ) values (
    v_conversation_id, p_sender_user_id,
    coalesce(nullif(left(btrim(p_body), 2000), ''), 'Shared a saved item'),
    'sent', p_post_id, p_client_idempotency_key
  )
  on conflict (sender_user_id, client_idempotency_key)
    where client_idempotency_key is not null
  do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select message.id, message.content_post_id, conversation.conversation_key
      into v_message_id, v_existing_post_id, v_existing_conversation_key
    from public.direct_messages message
    join public.direct_conversations conversation on conversation.id = message.conversation_id
    where message.sender_user_id = p_sender_user_id
      and message.client_idempotency_key = p_client_idempotency_key;
    if v_message_id is null
      or v_existing_post_id is distinct from p_post_id
      or v_existing_conversation_key is distinct from v_conversation_key then
      raise exception 'Idempotency key was already used for another message';
    end if;
  end if;

  update public.direct_conversations
  set last_message_at = now(), last_message_preview = coalesce(nullif(left(btrim(p_body), 120), ''), 'Shared a saved item')
  where id = v_conversation_id;

  return v_message_id;
end;
$$;

revoke all on function public.share_saved_content_message(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.share_saved_content_message(uuid, uuid, uuid, text, uuid) to service_role;

create or replace function public.create_saved_content_wish(
  p_owner_user_id uuid,
  p_post_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_image_url text,
  p_target_amount numeric,
  p_target_currency text,
  p_difficulty_level integer,
  p_visibility text,
  p_client_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wish_id uuid;
  v_existing_post_id uuid;
begin
  if p_client_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;
  select wish_id, post_id into v_wish_id, v_existing_post_id
  from public.feed_post_wish_links
  where owner_user_id = p_owner_user_id and client_idempotency_key = p_client_idempotency_key;
  if v_wish_id is not null then
    if v_existing_post_id <> p_post_id then raise exception 'Idempotency key was already used for another wish'; end if;
    return v_wish_id;
  end if;
  if not exists (
    select 1 from public.feed_posts post
    where post.id = p_post_id and post.author_user_id = p_owner_user_id
      and post.post_type = 'external_link' and post.deleted_at is null
  ) then
    raise exception 'Saved material not found';
  end if;

  insert into public.wishes (
    owner_user_id, title, description, category, image_url,
    target_amount, target_currency, difficulty_level, visibility
  ) values (
    p_owner_user_id, left(nullif(btrim(p_title), ''), 120), left(coalesce(p_description, ''), 1200),
    nullif(left(btrim(coalesce(p_category, '')), 80), ''), nullif(left(btrim(coalesce(p_image_url, '')), 900), ''),
    p_target_amount, coalesce(nullif(btrim(p_target_currency), ''), 'USD'), greatest(1, least(coalesce(p_difficulty_level, 1), 5)),
    case when p_visibility in ('public', 'team', 'contacts') then p_visibility else 'private' end
  ) returning id into v_wish_id;

  insert into public.feed_post_wish_links (post_id, wish_id, owner_user_id, client_idempotency_key)
  values (p_post_id, v_wish_id, p_owner_user_id, p_client_idempotency_key)
  on conflict (owner_user_id, client_idempotency_key)
    where client_idempotency_key is not null
  do nothing;
  if not found then
    delete from public.wishes where id = v_wish_id and owner_user_id = p_owner_user_id;
    select wish_id, post_id into v_wish_id, v_existing_post_id
    from public.feed_post_wish_links
    where owner_user_id = p_owner_user_id and client_idempotency_key = p_client_idempotency_key;
    if v_existing_post_id <> p_post_id then raise exception 'Idempotency key was already used for another wish'; end if;
  end if;
  return v_wish_id;
end;
$$;

revoke all on function public.create_saved_content_wish(uuid, uuid, text, text, text, text, numeric, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_saved_content_wish(uuid, uuid, text, text, text, text, numeric, text, integer, text, uuid) to service_role;

create or replace function public.attach_saved_content_wish(
  p_owner_user_id uuid,
  p_post_id uuid,
  p_wish_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.feed_posts post
    where post.id = p_post_id and post.author_user_id = p_owner_user_id
      and post.post_type = 'external_link' and post.deleted_at is null
  ) then
    raise exception 'Saved material not found';
  end if;
  if not exists (
    select 1 from public.wishes wish
    where wish.id = p_wish_id and wish.owner_user_id = p_owner_user_id and wish.deleted_at is null
  ) then
    raise exception 'Wish not found';
  end if;
  insert into public.feed_post_wish_links (post_id, wish_id, owner_user_id)
  values (p_post_id, p_wish_id, p_owner_user_id)
  on conflict (post_id, wish_id) do nothing;
  return true;
end;
$$;

revoke all on function public.attach_saved_content_wish(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_saved_content_wish(uuid, uuid, uuid) to service_role;

create or replace function public.delete_saved_external_content(p_owner_user_id uuid, p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feed_posts
  set deleted_at = now(), updated_at = now()
  where id = p_post_id and author_user_id = p_owner_user_id
    and post_type = 'external_link' and deleted_at is null;
  if not found then return false; end if;
  update public.feed_post_access set revoked_at = now()
  where post_id = p_post_id and revoked_at is null;
  update public.feed_post_external_links
  set normalized_url = null
  where post_id = p_post_id and relation = 'source';
  return true;
end;
$$;

revoke all on function public.delete_saved_external_content(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_saved_external_content(uuid, uuid) to service_role;
