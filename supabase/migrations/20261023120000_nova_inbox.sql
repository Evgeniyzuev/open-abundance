-- "Inbox from Nova": short personal messages that the operator (or Claude after the operator's approval) writes to
-- one person. The app shows them as Nova's message at the top of the person's Nova chat, which lives only on the
-- device, so the server keeps a message only until it is delivered.
-- Cleanup: delivered messages are deleted a day after delivery, undelivered ones when they expire (14 days).
create table if not exists public.nova_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 3 and 800),
  -- Who wrote it: 'operator' (signed-in operator) or 'claude' (token, after the operator's approval).
  source text not null default 'operator' check (source in ('operator', 'claude')),
  -- What prompted it, e.g. the analytics step name; never shown to the person.
  reason text check (reason is null or char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  delivered_at timestamptz
);

create index if not exists nova_inbox_messages_pending_idx
  on public.nova_inbox_messages (user_id, created_at)
  where delivered_at is null;

alter table public.nova_inbox_messages enable row level security;
revoke all on public.nova_inbox_messages from public, anon, authenticated;
grant select, insert, update, delete on public.nova_inbox_messages to service_role;

create or replace function public.cleanup_nova_inbox()
returns bigint
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.nova_inbox_messages
    where (delivered_at is not null and delivered_at < now() - interval '1 day')
       or (delivered_at is null and expires_at < now())
    returning 1
  )
  select count(*) from removed;
$$;

revoke all on function public.cleanup_nova_inbox() from public, anon, authenticated;
grant execute on function public.cleanup_nova_inbox() to service_role;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-nova-inbox-cleanup') then
    perform cron.unschedule('open-abundance-nova-inbox-cleanup');
  end if;
  perform cron.schedule(
    'open-abundance-nova-inbox-cleanup',
    '20 3 * * *',
    'select public.cleanup_nova_inbox();'
  );
end;
$$;
