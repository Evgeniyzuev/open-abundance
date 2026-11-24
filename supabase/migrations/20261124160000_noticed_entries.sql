-- «Заметил» (founder 2026-11-24): a person writes any small thought, worry, wish or observation in one line; Nova turns
-- it into one small action and, if the person wants, reminders at chosen local times. Reminders are sent by pg_cron
-- straight from the database through the usual notification event (in-app + web push + Telegram copy), so there is no
-- extra Vercel call and no edge function change.

create table if not exists public.noticed_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  reply text,
  action text,
  push_title text check (push_title is null or char_length(push_title) <= 80),
  push_body text check (push_body is null or char_length(push_body) <= 160),
  times text[] not null default '{}' check (array_length(times, 1) is null or array_length(times, 1) <= 4),
  weekdays_only boolean not null default false,
  timezone text not null default 'UTC',
  locale text not null default 'ru' check (locale in ('ru', 'en')),
  reminders_on boolean not null default false,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists noticed_entries_user_idx on public.noticed_entries (user_id, created_at desc);
create index if not exists noticed_entries_reminders_idx on public.noticed_entries (reminders_on) where reminders_on and status = 'active';

alter table public.noticed_entries enable row level security;
revoke all on public.noticed_entries from anon, authenticated;

-- Every 5 minutes: entries whose local time just reached one of their times get one reminder (idempotent per day/time).
create or replace function public.dispatch_noticed_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  slot text;
  local_now timestamp;
  local_date date;
  slot_time time;
  sent integer := 0;
begin
  for entry in
    select * from public.noticed_entries
    where reminders_on and status = 'active' and coalesce(array_length(times, 1), 0) > 0
  loop
    begin
      local_now := now() at time zone entry.timezone;
    exception when others then
      local_now := now() at time zone 'UTC';
    end;
    local_date := local_now::date;
    if entry.weekdays_only and extract(isodow from local_now) > 5 then
      continue;
    end if;
    foreach slot in array entry.times loop
      if slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        continue;
      end if;
      slot_time := slot::time;
      if local_now::time >= slot_time and local_now::time < slot_time + interval '10 minutes' then
        perform public.create_notification_event_raw(
          'noticed.reminder',
          'reminders',
          'noticed_entry',
          entry.id::text,
          coalesce(nullif(entry.push_title, ''), entry.action, 'Open Abundance'),
          coalesce(nullif(entry.push_body, ''), entry.text),
          '/?view=home&noticed=' || entry.id::text,
          array[entry.user_id],
          'noticed:' || entry.id::text || ':' || local_date::text || ':' || slot,
          jsonb_build_object('noticed_id', entry.id),
          true
        );
        sent := sent + 1;
      end if;
    end loop;
  end loop;
  return sent;
end;
$$;

revoke all on function public.dispatch_noticed_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-noticed-reminders') then
    perform cron.unschedule('open-abundance-noticed-reminders');
  end if;
  perform cron.schedule(
    'open-abundance-noticed-reminders',
    '*/5 * * * *',
    'select public.dispatch_noticed_reminders();'
  );
end;
$$;
