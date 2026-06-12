create index if not exists trust_events_created_by_user_id_idx
on public.trust_events (created_by_user_id);

create index if not exists trust_events_confirmed_by_user_id_idx
on public.trust_events (confirmed_by_user_id)
where confirmed_by_user_id is not null;

create index if not exists mutual_confirmations_trust_event_id_idx
on public.mutual_confirmations (trust_event_id)
where trust_event_id is not null;
