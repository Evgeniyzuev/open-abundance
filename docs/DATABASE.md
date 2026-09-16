# Database

## Reflection reminder delivery

Reflection content remains local-only. Migration `20260721120000_reflection_push_reminders.sql` adds two closed service-role tables used only for neutral Web Push delivery:

- `push_subscriptions`: endpoint capability and browser encryption keys;
- `reminder_jobs`: due time, timezone, locale, opaque local entity id and delivery state.

Both tables have RLS enabled with no client policies. Due jobs are claimed idempotently through service-role functions and dispatched by the scheduled `send-reflection-reminders` Edge Function. No note body, AI answer, possible cause or task title is stored in these tables.

As of 2026-09-16, the notification-center migration `20260915181547` is applied to project `bsikxrsguwketlloflgi`, and `send-reflection-reminders` is deployed as active version 3. Its VAPID and cron secrets are configured, both cron values are stored in Vault, and manual plus minute-cron calls returned HTTP 200 with empty queues. The public VAPID endpoint returned HTTP 200 with the configured key; publication of the updated web client and real-device delivery remain unverified. See [Notifications And Web Push Plan](NOTIFICATIONS_PLAN.md) before claiming Web Push is live.

Supabase project ref: `bsikxrsguwketlloflgi`

## Source Of Truth

- `supabase/migrations/` stores schema changes.
- `supabase/schema.sql` can store a generated schema snapshot.
- `supabase/seed.sql` stores optional local seed data.
- `lib/database.types.ts` should be generated from the remote schema when the API surface changes.

## Challenge reward amounts

Challenge completion rewards use two numeric columns: `challenges.core_reward_amount` and `challenges.wallet_reward_amount`. The UI adds the `Core`/`Wallet` labels and currency formatting. `settle_user_challenge_rewards(user_id, challenge_id)` reads the stored values and settles both balances in one transaction; `user_challenges` keeps both amounts as the completion snapshot.

The migrations `20260912192306_challenge_dual_account_rewards.sql` and `20260913090000_peer_review_dual_account_rewards.sql` were an expand/contract change. The deployed API now reads only numeric Core/Wallet amounts; the legacy challenge and peer-review compatibility columns have been removed by the cleanup migration after the new application version was published.

The rollout compatibility layer has now been removed from the application code and `/api/challenges` serves only the numeric reward contract. Migration `20260913100000_challenge_rewards_cleanup.sql` updated the economy and peer-review RPCs, removed the old `complete_user_challenge` wrapper, and dropped only the challenge reward compatibility columns. It was applied to project `bsikxrsguwketlloflgi` on 2026-09-13. `lib/database.types.ts` now reflects the removed challenge mirrors while preserving the repository's existing string-backed TON numeric conventions; a full generator refresh would introduce unrelated type changes in those routes.

## Core and Wallet history

`/api/core/accrual-history` remains the narrow daily-accrual contract used by notifications. `/api/core/history` is the owner-scoped mixed read model for daily accruals, challenge and peer-review Core rewards, Wallet → Core topups, and team Core bonuses. It reads existing settlement facts, applies a bounded newest-first limit, and does not create or settle ledger rows. Challenge titles are normalized from the stored `{ en, ru }` JSON value to the requested locale before reaching the UI. `/api/wallet/history` includes `challenge_reward` and `wallet_core_topup` ledger operations alongside its existing Wallet operations. This slice adds no Supabase migration and treats a missing or unreliable source as absent instead of inventing an operation.

## Common Commands

Authenticate the CLI first:

```bash
pnpm dlx supabase login
```

Or set `SUPABASE_ACCESS_TOKEN` in your shell before running CLI commands.

Link this repo to the remote project:

```bash
pnpm db:link
```

Pull the current remote schema into a migration:

```bash
pnpm db:pull
```

Create a new migration with the globally installed CLI:

```bash
supabase migration new <name>
```

Apply local migrations to the linked remote project:

For schema inspection and local-only workflows, the package scripts remain available. On this Windows workspace, do not use `pnpm db:push` to apply remote migrations; use the verified linked CLI workflow below.

### Remote migration push (verified Windows workflow)

The working apply path is the globally installed `supabase` CLI with the linked project and the database password read from `.env`:

```powershell
$path = Join-Path (Get-Location) '.env'
$values = @{}
foreach ($line in Get-Content -LiteralPath $path) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
$pw = [string]$values['POSTGRES_PASSWORD']
if ([string]::IsNullOrWhiteSpace($pw)) {
  throw 'POSTGRES_PASSWORD is missing in .env'
}

& supabase db push --linked --password $pw
$exitCode = $LASTEXITCODE
Remove-Variable pw -ErrorAction SilentlyContinue
exit $exitCode
```

The CLI may ask for confirmation; answer `Y`. The regex must contain single backslashes (`\s`), as shown above. Do not paste a JSON- or shell-escaped form with `\\s`, because it will not parse the `.env` lines correctly.

Before applying, verify that `project_id` in `supabase/config.toml`, `supabase/.temp/project-ref`, `SUPABASE_URL`, and the Postgres host all point to `bsikxrsguwketlloflgi`. Do not print `$pw` or construct a `--db-url` from `POSTGRES_URL*`.

After applying, verify the remote migration history:

```powershell
& supabase migration list --linked --password $pw
```

The newest local timestamp must have the same value in the `Remote` column. Also make one read-only REST request with the local service-role key to a newly created or changed table and confirm HTTP 200. Never include the password or service-role key in output, logs, documentation, or client code.

Generate TypeScript database types:

```bash
pnpm db:types
```

Dump the public schema snapshot:

```bash
pnpm db:dump
```

Dump data from another Supabase/Postgres database:

```bash
pnpm dlx supabase db dump --db-url "<OLD_DATABASE_URL>" -f old_data.sql --data-only --use-copy
```

## Notes

CSV import/export is useful for individual tables. SQL dumps are better for moving full schemas, policies, indexes, functions, triggers, and larger data sets.

Local-first storage, client/server source-of-truth rules, restore behavior, and sync policy are documented in [`LOCAL_FIRST_SYNC.md`](./LOCAL_FIRST_SYNC.md).

Guest-first onboarding, user identity states, profile schema, guest claim flow, and rewards planning are documented in [`USERS.md`](./USERS.md).

Verification tables, RLS boundary, provider webhooks and reward-gate schema for humanity/uniqueness are documented in [`HUMANITY_VERIFICATION_PLAN.md`](./HUMANITY_VERIFICATION_PLAN.md).

General development rules, including UTF-8/PowerShell safety, are documented in [`DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md).

Do not commit `.env`, database passwords, service role keys, JWT secrets, or `supabase/.temp`.
