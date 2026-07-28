-- Build the percentage sign with chr(37) so the migration is safe for
-- Supabase CLI statement parsing as well as direct PostgreSQL execution.
alter table public.user_profiles
  add column if not exists avatar_position text;

update public.user_profiles
set avatar_position = concat('50', chr(37), ' 50', chr(37))
where avatar_position is null;

alter table public.user_profiles
  alter column avatar_position set default concat('50', chr(37), ' 50', chr(37));

alter table public.user_profiles
  alter column avatar_position set not null;

comment on column public.user_profiles.avatar_position is
  'Focal point for the circular avatar crop, stored as CSS x% y%.';
