-- Reinvest share of the daily Core accrual may be changed only by humanity-confirmed users.
-- Everyone else is fixed at 100% (the whole accrual stays in Core). The rule lives in the database
-- so no route can bypass it, and the daily accrual keeps reading the stored percentage.
--
-- Effects:
--   * new accounts start at 100%;
--   * existing unconfirmed accounts are set to 100% once, now;
--   * an unconfirmed user cannot save any other value (changes to 100% stay allowed);
--   * a confirmed user (humanity_level >= 2) can set any value from 0 to 100.

alter table public.core_accounts
  alter column reinvest_percent set default 100;

create or replace function public.enforce_reinvest_requires_humanity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reinvest_percent is distinct from 100 and not public.is_humanity_confirmed(new.user_id) then
      new.reinvest_percent := 100;
    end if;
    return new;
  end if;

  if new.reinvest_percent is distinct from old.reinvest_percent
     and new.reinvest_percent is distinct from 100
     and not public.is_humanity_confirmed(new.user_id) then
    raise exception 'Reinvest can be changed only after humanity confirmation.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_reinvest_requires_humanity() from public, anon, authenticated;

drop trigger if exists enforce_reinvest_requires_humanity_insert on public.core_accounts;
create trigger enforce_reinvest_requires_humanity_insert
before insert on public.core_accounts
for each row execute function public.enforce_reinvest_requires_humanity();

drop trigger if exists enforce_reinvest_requires_humanity_update on public.core_accounts;
create trigger enforce_reinvest_requires_humanity_update
before update of reinvest_percent on public.core_accounts
for each row execute function public.enforce_reinvest_requires_humanity();

-- One-time alignment of existing accounts (setting 100 is always allowed by the trigger).
update public.core_accounts
set reinvest_percent = 100, updated_at = now()
where reinvest_percent is distinct from 100
  and not public.is_humanity_confirmed(user_id);
