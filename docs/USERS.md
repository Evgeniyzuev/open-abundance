# Users

This document describes the current authenticated user model, pre-auth onboarding, and database direction.

Current status (2026-07-23): the user-facing guest mode has been removed. A visitor sees the three-screen onboarding, presses `GO` on the completed route, and then chooses Google or Email on a dedicated method-picker screen. Email opens a separate screen with the address, send action, and always-visible six-digit OTP field. The code is verified inside the installed PWA so its Supabase session is created in the same browser context. The local guest identity remains an internal implementation detail for referral attribution, analytics continuity, and claiming existing local data; it no longer grants access to app features.

## Product Approach

The app should explain its value before asking for authentication, then create a durable account before any personal or server-backed feature is used.

Authentication is separate from proof-of-humanity. The three-level humanity/uniqueness flow and its privacy boundary are defined in [`HUMANITY_VERIFICATION_PLAN.md`](./HUMANITY_VERIFICATION_PLAN.md).

Goal:

- keep the first three onboarding screens focused on value and outcomes;
- make account creation the single final onboarding action;
- ensure every action and financial reward belongs to a durable user from the start.

Recommended first-run flow:

1. User opens the app.
2. App shows `mission -> stories -> 20-level program`.
3. The third screen shows `Route ready` and offers one action: `GO`.
4. A separate auth screen offers Google and Email buttons.
5. Email opens a second auth screen where the user requests and enters a six-digit OTP.
6. Successful auth creates or loads the profile, Core, and Wallet without replacing existing onboarding state.
7. The server grants the idempotent `+2$ Core` starter bonus on first registration.
8. The app shows the one-time first-reward receipt and opens the feed.
9. Existing local identity/referral data is attached to the registered account.

## Identity States

### Pre-auth Visitor

A pre-auth visitor is not an application user and cannot mount the app shell.

Properties:

- generated on first launch;
- stored locally;
- can be reused on the same device for attribution and migration;
- can complete only the marketing onboarding and start Google OAuth or request an email OTP;
- does not yet exist as a durable user in Supabase Auth;
- cannot create new app data or receive preview/authoritative financial rewards.

Possible local fields:

```ts
type LocalGuestIdentity = {
  guestId: string;
  createdAt: string;
  lastSeenAt: string;
  claimedUserId?: string;
};
```

Storage:

- IndexedDB is preferred.
- localStorage is acceptable only for a small pointer/session hint.

### Registered User

A registered user exists in Supabase Auth and in app profile tables.

Current registration options: Google and email OTP. Both paths use the same post-auth registration claim. Apple is the preferred future consumer/iOS option, Microsoft is the simplest broadly useful professional option, and other providers remain deferred.

After registration:

- user has `auth.users.id`;
- profile row exists;
- local guest data can be claimed;
- sync to server becomes active;
- rewards/financial accruals can become real server-side records.

## Return Visits

On app start:

1. Check Supabase Auth session.
2. If authenticated, load registered user context.
3. If unauthenticated and onboarding was not seen, start at the mission screen.
4. If unauthenticated and onboarding was already seen, open the separate sign-in options screen.
5. Never mount the app shell for an unauthenticated visitor, including offline.

## Registration As The Final Onboarding Action

Registration is not a catalog challenge. The old `Save Your Progress` challenge is inactive but retained as the historical/idempotency backing record for existing challenge reward accounting. Its UI is replaced by `GO` on onboarding screen three, a Google/Email method picker, a dedicated email OTP screen, and a one-time `First reward` receipt after successful auth.

## Email OTP Operations

The client calls Supabase `signInWithOtp` with `shouldCreateUser: true`, accepts the six-digit code in the installed PWA, and calls `verifyOtp({ email, token, type: "email" })`. A successful verification creates the session in that PWA context and then opens `/auth/callback?method=email` for the shared profile/reward/referral claim. The pending email and resend timestamp are retained locally for 15 minutes so an iOS process reload returns to the code-entry step. Before production use:

1. Enable the Email provider in Supabase Authentication.
2. Change the Magic Link template to display `{{ .Token }}` and remove every `{{ .ConfirmationURL }}` sign-in link.
3. Configure a production SMTP provider and the sending domain's SPF/DKIM records. Supabase's built-in sender is only suitable for restricted testing.
4. Keep the default 60-second resend cooldown in the UI and review the matching Authentication rate limit before changing it.

No database migration is needed for email auth. The existing auth user, profile claim, Core/Wallet creation, referral transfer, and starter reward contracts remain unchanged.

## Rewards Policy

Before registration no progress, achievements, or financial previews are created.

After registration:

- server creates authoritative reward records;
- phone verification can add bonus;
- financial state comes from the database/server.

This matches the source-of-truth policy in [`LOCAL_FIRST_SYNC.md`](./LOCAL_FIRST_SYNC.md):

- personal data is local-first;
- financial data is server/database authoritative.

## Guest Data Claim

When the user registers, the app should claim local guest data.

High-level flow:

1. User completes auth.
2. App gets `userId` from Supabase Auth.
3. App creates/loads user profile.
4. App marks local guest as claimed by `userId`.
5. App uploads local actions/data with stable client-generated ids.
6. Server stores records under `userId`.
7. Local records are marked `synced`.

Important:

- do not delete server data because local data is empty;
- use explicit action sync;
- keep soft deletion;
- make guest claim idempotent.

## Database Draft

Supabase Auth already owns the core auth user:

```sql
auth.users (
  id uuid primary key,
  email text,
  phone text,
  created_at timestamptz
)
```

Application profile table:

```sql
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  default_locale text not null default 'ru',
  timezone text,
  onboarding_state jsonb not null default '{}'::jsonb,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Optional linked identities table:

```sql
create table public.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_subject text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);
```

Guest claim table:

```sql
create table public.guest_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null,
  claimed_at timestamptz not null default now(),
  device_label text,
  unique (guest_id)
);
```

## RLS Draft

Profiles:

```sql
alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```



Rewards should generally be written by server-side code or controlled database functions, not directly by the client.

## Historical Development Plan

The checklist below records the original guest-first direction. The current auth-required decision above supersedes items that say the app remains usable in guest mode or that registration is a task.

1. Add local guest identity storage.
   - Generate `guestId` on first launch.

2. Add user context layer.
   - Detect Supabase Auth session.
   - Return either `guest` or `registered` context.
   - Keep app usable in guest mode.

3. Add onboarding task.
   [x] Add a recommended task/card: `Save your progress`.

4. Add Supabase Auth.
   - Email first.
   - Google next.
   - Telegram if product direction still needs it.
   - Phone verification as optional bonus.

5. Add profile table migration.
   - `user_profiles`.
   - RLS policies.
   - trigger/function to create profile after signup if useful.

6. Add guest claim flow.
   - Write `guest_claims`.
   - Mark local guest as claimed.
   - Make the operation idempotent.

7. Add sync ownership.
   - Personal records get `user_id`.
   - Local records keep stable ids.
   - Sync sends explicit actions to server.
   - Empty client does not delete server data.

8. Add restore flow.
   - If authenticated server data exists and local data is missing, offer restore.
   - Do not silently overwrite local data.

9. Add financial ledger.
   - Store every Core and Wallet balance change as a server-authoritative financial operation.
   - Keep challenge progress separate from financial operation history.
   - Use ledger/event rows for reward payouts, transfers, reversals and future audits.

10. Add account/storage settings.
    - show guest/registered state;
    - show storage usage;
    - clear cache;
    - reset local data with warning;
    - restore from server.

## Open Questions

- Which auth providers should launch first: email only, email + Google, or email + Google + Telegram?
- Should phone verification be available immediately or after core sync works?
- What exact bonus does phone verification grant?
- Do guest users need cross-device transfer before registration?
- Should guest data expire locally after long inactivity?
