# Reflection Inbox And Processing

## Status

Implemented locally on 2026-07-21:

- one-field reflection capture in `Goals -> Notes`;
- local `Process` smart list and persisted processing state;
- explicit AI processing with up to three questions;
- editable proposal, possible-cause confirmation, alternatives, resources and if-then action;
- safety response for immediate-risk language;
- prefilled one-time task with source-note linkage and completion feedback;
- in-app due reminders and neutral Web Push infrastructure;
- privacy-safe analytics without note or answer text.

The Supabase migration and Edge Function are committed but must be deployed and configured before closed-app push delivery works.

## Product Contract

Raw captures stay in the local `open-abundance-offline` IndexedDB database. No request is made during capture. Pressing `Process with AI` explicitly sends only the selected note and up to three answers to the configured provider; the route does not persist or log that content.

AI output is advisory and editable. The UI says `Possible causes`, never claims a true or hidden cause, and requires the user to confirm hypotheses. Every successful session ends in one of: act now, wait, accept, learn, or ask a type of person. Closing without a task is valid.

## Local Data

`Note` has optional `kind = reflection` and a versioned `processing` object. The object contains status, answers, current question, proposal, linked task, completion and optional feedback. This is a record-shape extension, so IndexedDB remains version 4.

`TaskItem` has optional `sourceNoteId` and `remindAt`. Completing a linked task closes the reflection. Legacy records normalize with both fields absent.

Daily-review settings use `open-abundance:reflection-settings:v1`. Pending server reminder registrations use `open-abundance:pending-reminders:v1` and retry when connectivity returns.

## Push Deployment

1. Apply `20260721120000_reflection_push_reminders.sql`.
2. Generate a VAPID key pair.
3. Configure the web app with `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`.
4. Configure the `send-reflection-reminders` Edge Function with:
   - `WEB_PUSH_VAPID_PUBLIC_KEY`;
   - `WEB_PUSH_VAPID_PRIVATE_KEY`;
   - `WEB_PUSH_VAPID_SUBJECT`;
   - `REMINDER_CRON_SECRET`.
5. Store `project_url` and the same secret as `reflection_reminder_cron_secret` in Supabase Vault.
6. Deploy `send-reflection-reminders` and verify the minute cron job.

The server stores subscription keys, schedule, timezone, locale, opaque local IDs and delivery state. It never stores the reflection body, AI proposal or task title. Notification copy is deliberately generic.

## Verification

- `pnpm exec tsc --noEmit`;
- `pnpm lint`;
- Playwright reflection capture smoke test;
- manual production-device push test after VAPID/Vault configuration;
- manual RU/EN review of the AI question, proposal, safety and task handoff screens.

## Deferred

- voice and attachments;
- sync or backup of reflection content;
- automatic processing;
- person matching or message sending;
- community-derived advice before consent, anonymization and outcome verification exist.
