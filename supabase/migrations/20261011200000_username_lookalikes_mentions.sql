-- Nickname stage 4: look-alike protection and a "social" notification category for @mentions.

-- Same key as lib/username.ts usernameSkeleton(): lower case, rn -> m, vv -> w, 0->o 1/i->l 5->s 3->e 8->b 2->z.
create or replace function public.username_skeleton(p_username text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select translate(replace(replace(lower(p_username), 'rn', 'm'), 'vv', 'w'), '01i5382', 'ollsebz');
$$;

alter table public.user_profiles
  add column if not exists username_skeleton text generated always as (public.username_skeleton(username)) stored;

create index if not exists user_profiles_username_skeleton_idx
  on public.user_profiles (username_skeleton) where username_skeleton is not null;

-- A nickname that looks like someone else's is "lookalike" (claim_username passes the status through).
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
  if exists (
    select 1 from public.user_profiles as profile
    where profile.username_skeleton = public.username_skeleton(v_name) and profile.user_id is distinct from p_user_id
  ) then return 'lookalike'; end if;
  -- A name released in the last 30 days stays with its previous owner.
  if exists (
    select 1 from public.username_changes as change
    where change.old_username = v_name and change.user_id is distinct from p_user_id and change.changed_at > now() - interval '30 days'
  ) then return 'taken'; end if;
  return 'available';
end;
$$;

revoke all on function public.username_skeleton(text) from public, anon, authenticated;
grant execute on function public.username_skeleton(text) to service_role;

-- Mentions are a user-controllable category.
alter table public.notification_events drop constraint if exists notification_events_category_check;
alter table public.notification_events add constraint notification_events_category_check
  check (category in ('deals', 'disputes', 'wallet', 'rewards', 'team', 'confirmations', 'reminders', 'social', 'system'));
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('deals', 'disputes', 'wallet', 'rewards', 'team', 'confirmations', 'reminders', 'social', 'system'));
