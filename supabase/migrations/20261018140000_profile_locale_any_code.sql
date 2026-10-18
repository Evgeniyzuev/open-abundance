-- The list of supported interface languages lives in code (lib/locales.ts) and is validated by
-- /api/user/locale, so adding a language needs no migration. The database only guards the shape.
alter table public.user_profiles
  drop constraint if exists user_profiles_default_locale_check;

alter table public.user_profiles
  add constraint user_profiles_default_locale_check
  check (default_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
