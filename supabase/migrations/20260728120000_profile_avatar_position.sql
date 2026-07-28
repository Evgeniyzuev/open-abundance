alter table public.user_profiles
  add column if not exists avatar_position text not null default '50% 50%';

comment on column public.user_profiles.avatar_position is
  'Focal point for the circular avatar crop, stored as CSS x% y%.';
