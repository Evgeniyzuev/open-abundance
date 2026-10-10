-- Nicknames (usernames): format, uniqueness, reserved words, change log and atomic claim.
--
-- user_profiles.username already exists but was never validated or filled. A nickname uses only
-- a-z and 0-9, starts with a letter, has 5-24 characters and is stored in lower case, so a plain
-- unique index is case-insensitive. Generation happens in the application from the person's name
-- (never from an email); this migration enforces the rules and makes claiming atomic.

create table if not exists public.reserved_usernames (
  name text primary key check (name = lower(name))
);

insert into public.reserved_usernames (name) values
  ('admin'), ('administrator'), ('support'), ('helpdesk'), ('official'), ('openabundance'), ('abundance'),
  ('abundancesystem'), ('nova'), ('system'), ('wallet'), ('market'), ('marketplace'), ('teams'), ('api'),
  ('moderator'), ('staff'), ('security'), ('billing'), ('terms'), ('privacy'), ('contact'), ('login'),
  ('logout'), ('signin'), ('signup'), ('settings'), ('profile'), ('profiles'), ('users'), ('people'),
  ('feed'), ('blog'), ('posts'), ('challenges'), ('wishes'), ('payments'), ('transfer'), ('deposit'),
  ('withdraw'), ('founder'), ('owner'), ('operator'), ('coordinator'), ('treasury'), ('oasystem'),
  ('undefined'), ('anonymous'), ('everyone'), ('unknown'), ('nobody'), ('invite'), ('referral'),
  ('reflection')
on conflict (name) do nothing;

alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from public, anon, authenticated;
grant select on public.reserved_usernames to service_role;

create table if not exists public.username_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_username text,
  new_username text not null,
  source text not null default 'user' check (source in ('registration', 'user', 'backfill', 'system')),
  changed_at timestamptz not null default now()
);

create index if not exists username_changes_user_idx on public.username_changes (user_id, changed_at desc);
create index if not exists username_changes_old_idx on public.username_changes (old_username, changed_at desc) where old_username is not null;

alter table public.username_changes enable row level security;
revoke all on public.username_changes from public, anon, authenticated;
grant select, insert on public.username_changes to service_role;

alter table public.user_profiles
  drop constraint if exists user_profiles_username_format;
alter table public.user_profiles
  add constraint user_profiles_username_format check (username is null or username ~ '^[a-z][a-z0-9]{4,23}$');

create unique index if not exists user_profiles_username_unique
  on public.user_profiles (username) where username is not null;

-- Availability of a nickname for a person, without changing anything.
create or replace function public.username_status(p_username text, p_user_id uuid default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_name text := lower(btrim(coalesce(p_username, '')));
begin
  v_name := regexp_replace(v_name, '^@+', '');
  if v_name !~ '^[a-z][a-z0-9]{4,23}$' then return 'invalid'; end if;
  if exists (select 1 from public.reserved_usernames as reserved where reserved.name = v_name) then return 'reserved'; end if;
  if exists (select 1 from public.user_profiles as profile where profile.username = v_name and profile.user_id is distinct from p_user_id) then return 'taken'; end if;
  if exists (select 1 from public.user_profiles as profile where profile.username = v_name and profile.user_id = p_user_id) then return 'yours'; end if;
  -- A name released in the last 30 days stays with its previous owner.
  if exists (
    select 1 from public.username_changes as change
    where change.old_username = v_name and change.user_id is distinct from p_user_id and change.changed_at > now() - interval '30 days'
  ) then return 'taken'; end if;
  return 'available';
end;
$$;

-- Atomically sets a person's nickname. Result codes: ok, unchanged, invalid, reserved, taken,
-- cooldown (changed within 7 days), limit (3 changes in 30 days), missing (no profile).
-- The first change after the automatic nickname is free of the cooldown.
create or replace function public.claim_username(p_user_id uuid, p_username text, p_source text default 'user')
returns table (result_code text, new_username text)
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := regexp_replace(lower(btrim(coalesce(p_username, ''))), '^@+', '');
  v_status text;
  v_current text;
  v_user_changes integer;
  v_last_change timestamptz;
  v_recent integer;
begin
  if p_source not in ('registration', 'user', 'backfill', 'system') then p_source := 'user'; end if;

  perform pg_advisory_xact_lock(hashtextextended('username:' || v_name, 0));

  select profile.username into v_current from public.user_profiles as profile where profile.user_id = p_user_id for update;
  if not found then return query select 'missing'::text, null::text; return; end if;

  v_status := public.username_status(v_name, p_user_id);
  if v_status = 'yours' then return query select 'unchanged'::text, v_name; return; end if;
  if v_status <> 'available' then return query select v_status, null::text; return; end if;

  if p_source = 'user' and v_current is not null then
    select count(*), max(change.changed_at) into v_user_changes, v_last_change
    from public.username_changes as change where change.user_id = p_user_id and change.source = 'user';
    if v_user_changes > 0 then
      if v_last_change > now() - interval '7 days' then return query select 'cooldown'::text, null::text; return; end if;
      select count(*) into v_recent from public.username_changes as change
      where change.user_id = p_user_id and change.source = 'user' and change.changed_at > now() - interval '30 days';
      if v_recent >= 3 then return query select 'limit'::text, null::text; return; end if;
    end if;
  end if;

  begin
    update public.user_profiles as profile set username = v_name, updated_at = now() where profile.user_id = p_user_id;
  exception when unique_violation then
    return query select 'taken'::text, null::text; return;
  end;

  insert into public.username_changes (user_id, old_username, new_username, source)
  values (p_user_id, v_current, v_name, p_source);

  return query select 'ok'::text, v_name;
end;
$$;

revoke all on function public.username_status(text, uuid) from public, anon, authenticated;
revoke all on function public.claim_username(uuid, text, text) from public, anon, authenticated;
grant execute on function public.username_status(text, uuid) to service_role;
grant execute on function public.claim_username(uuid, text, text) to service_role;
