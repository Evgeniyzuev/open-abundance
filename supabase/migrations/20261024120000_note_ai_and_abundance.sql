-- AI review of notes and the built-in "Abundance" list.
--
-- note_ai_requests: one request to review one note. Notes live only on the device, so the request carries a copy of
-- the note text. A quick review is answered at once by the AI gateway, a deep one by Claude in the daily procedure.
-- The app picks up answers when it opens; the text is erased once the answer is delivered, the row is deleted a day
-- later, and anything never delivered is deleted after 14 days.
create table if not exists public.note_ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_note_id text not null check (char_length(client_note_id) between 1 and 80),
  mode text not null check (mode in ('quick', 'deep')),
  action text not null check (action in ('sort', 'advice', 'plan', 'tasks', 'links')),
  locale text not null default 'en' check (char_length(locale) <= 8),
  note_text text check (note_text is null or char_length(note_text) <= 4000),
  -- Excerpts of other notes ("links") and the person's list titles ("sort"); erased with the text.
  context_text text check (context_text is null or char_length(context_text) <= 6000),
  status text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days'
);

create index if not exists note_ai_requests_queue_idx
  on public.note_ai_requests (mode, created_at)
  where status = 'queued';

create index if not exists note_ai_requests_user_idx
  on public.note_ai_requests (user_id, created_at)
  where delivered_at is null;

alter table public.note_ai_requests enable row level security;
revoke all on public.note_ai_requests from public, anon, authenticated;
grant select, insert, update, delete on public.note_ai_requests to service_role;

-- abundance_notes: notes from the built-in "Abundance" list (thoughts about post-scarcity, AI and abundance, ideas
-- and remarks about the app). The list tells people that the team and AI read them. Claude goes through the new
-- ones in the daily procedure, can thank the author through the Nova inbox, and writes finished proposals into a
-- document in the repository; the raw text stays here.
create table if not exists public.abundance_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_note_id text not null check (char_length(client_note_id) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  is_operator boolean not null default false,
  status text not null default 'new' check (status in ('new', 'read', 'valued', 'done')),
  -- Claude's private remark for the team; never shown to the author.
  team_note text check (team_note is null or char_length(team_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, client_note_id)
);

create index if not exists abundance_notes_new_idx
  on public.abundance_notes (updated_at)
  where status = 'new';

alter table public.abundance_notes enable row level security;
revoke all on public.abundance_notes from public, anon, authenticated;
grant select, insert, update, delete on public.abundance_notes to service_role;

create or replace function public.cleanup_note_ai_requests()
returns bigint
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.note_ai_requests
    where (delivered_at is not null and delivered_at < now() - interval '1 day')
       or (delivered_at is null and expires_at < now())
    returning 1
  )
  select count(*) from removed;
$$;

revoke all on function public.cleanup_note_ai_requests() from public, anon, authenticated;
grant execute on function public.cleanup_note_ai_requests() to service_role;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-note-ai-cleanup') then
    perform cron.unschedule('open-abundance-note-ai-cleanup');
  end if;
  perform cron.schedule(
    'open-abundance-note-ai-cleanup',
    '25 3 * * *',
    'select public.cleanup_note_ai_requests();'
  );
end;
$$;
