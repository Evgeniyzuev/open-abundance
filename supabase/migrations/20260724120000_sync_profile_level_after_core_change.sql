create or replace function public.update_core_level()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.level := public.calculate_core_level(new.balance);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_profile_level_after_core_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_level integer := 0;
begin
  if tg_op = 'UPDATE' then
    previous_level := coalesce(old.level, 0);
  end if;

  update public.user_profiles
  set level = new.level,
      updated_at = now()
  where user_id = new.user_id
    and level is distinct from new.level;

  if new.level is distinct from previous_level then
    perform public.revalidate_team_membership_for_level_change(new.user_id, new.level);
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_sync_profile_level_after_core_change on public.core_accounts;
create trigger trigger_sync_profile_level_after_core_change
after insert or update of balance on public.core_accounts
for each row
execute function public.sync_profile_level_after_core_change();

update public.user_profiles profile
set level = core.level,
    updated_at = now()
from public.core_accounts core
where profile.user_id = core.user_id
  and profile.level is distinct from core.level;
