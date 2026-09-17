-- Open authenticated-user access to the existing P2P foundation and persist
-- the notification defaults without changing any risk or limit calculation.

insert into public.p2p_pilot_members (user_id, status, notes, approved_at)
select id, 'active', 'Provisioned for authenticated-user P2P access.', now()
from auth.users
on conflict (user_id) do nothing;

insert into public.notification_preferences (user_id, category, in_app_enabled, push_enabled, locale)
select users.id, categories.category, true, true, 'en'
from auth.users users
cross join (
  values ('deals'::text), ('disputes'), ('wallet'), ('rewards'),
         ('team'), ('confirmations'), ('reminders'), ('system')
) categories(category)
on conflict (user_id, category) do nothing;

create or replace function public.provision_account_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.p2p_pilot_members (user_id, status, notes, approved_at)
  values (new.id, 'active', 'Provisioned for authenticated-user P2P access.', now())
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id, category, in_app_enabled, push_enabled, locale)
  select new.id, categories.category, true, true, 'en'
  from (
    values ('deals'::text), ('disputes'), ('wallet'), ('rewards'),
           ('team'), ('confirmations'), ('reminders'), ('system')
  ) categories(category)
  on conflict (user_id, category) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_account_defaults() from public, anon, authenticated;

drop trigger if exists provision_account_defaults_on_signup on auth.users;
create trigger provision_account_defaults_on_signup
  after insert on auth.users
  for each row execute function public.provision_account_defaults();
