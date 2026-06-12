create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct' check (conversation_type in ('direct')),
  conversation_key text not null unique,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_conversation_participants (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_read_at timestamptz,
  archived_at timestamptz,
  muted_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'sent' check (status in ('sent', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists direct_conversations_last_message_at_idx
on public.direct_conversations (last_message_at desc nulls last, updated_at desc);

create index if not exists direct_conversation_participants_user_idx
on public.direct_conversation_participants (user_id, created_at desc);

create index if not exists direct_messages_conversation_created_idx
on public.direct_messages (conversation_id, created_at desc);

create index if not exists direct_messages_sender_created_idx
on public.direct_messages (sender_user_id, created_at desc);

alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_participants enable row level security;
alter table public.direct_messages enable row level security;

grant select, insert, update on table public.direct_conversations to authenticated, service_role;
grant select, insert, update on table public.direct_conversation_participants to authenticated, service_role;
grant select, insert, update on table public.direct_messages to authenticated, service_role;

drop policy if exists "Direct conversations are visible to participants" on public.direct_conversations;
create policy "Direct conversations are visible to participants"
on public.direct_conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversation_participants participant
    where participant.conversation_id = direct_conversations.id
      and participant.user_id = (select auth.uid())
  )
);

drop policy if exists "Direct conversations can be created by creator" on public.direct_conversations;
create policy "Direct conversations can be created by creator"
on public.direct_conversations
for insert
to authenticated
with check ((select auth.uid()) = created_by_user_id);

drop policy if exists "Direct conversations can be updated by participants" on public.direct_conversations;
create policy "Direct conversations can be updated by participants"
on public.direct_conversations
for update
to authenticated
using (
  exists (
    select 1
    from public.direct_conversation_participants participant
    where participant.conversation_id = direct_conversations.id
      and participant.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.direct_conversation_participants participant
    where participant.conversation_id = direct_conversations.id
      and participant.user_id = (select auth.uid())
  )
);

drop policy if exists "Direct participants can read own conversation membership" on public.direct_conversation_participants;
create policy "Direct participants can read own conversation membership"
on public.direct_conversation_participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.direct_conversation_participants viewer_participant
    where viewer_participant.conversation_id = direct_conversation_participants.conversation_id
      and viewer_participant.user_id = (select auth.uid())
  )
);

drop policy if exists "Direct participants can insert self membership" on public.direct_conversation_participants;
create policy "Direct participants can insert self membership"
on public.direct_conversation_participants
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Direct participants can update own membership" on public.direct_conversation_participants;
create policy "Direct participants can update own membership"
on public.direct_conversation_participants
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Direct messages are visible to participants" on public.direct_messages;
create policy "Direct messages are visible to participants"
on public.direct_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversation_participants participant
    where participant.conversation_id = direct_messages.conversation_id
      and participant.user_id = (select auth.uid())
  )
);

drop policy if exists "Direct participants can send own messages" on public.direct_messages;
create policy "Direct participants can send own messages"
on public.direct_messages
for insert
to authenticated
with check (
  sender_user_id = (select auth.uid())
  and exists (
    select 1
    from public.direct_conversation_participants participant
    where participant.conversation_id = direct_messages.conversation_id
      and participant.user_id = (select auth.uid())
  )
);

drop policy if exists "Direct senders can soft-delete own messages" on public.direct_messages;
create policy "Direct senders can soft-delete own messages"
on public.direct_messages
for update
to authenticated
using (sender_user_id = (select auth.uid()))
with check (sender_user_id = (select auth.uid()));

drop trigger if exists touch_direct_conversations_updated_at on public.direct_conversations;
create trigger touch_direct_conversations_updated_at
before update on public.direct_conversations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_direct_messages_updated_at on public.direct_messages;
create trigger touch_direct_messages_updated_at
before update on public.direct_messages
for each row execute function public.touch_updated_at();
