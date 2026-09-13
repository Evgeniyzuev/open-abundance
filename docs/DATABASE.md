# Database

## Reflection reminder delivery

Reflection content remains local-only. Migration `20260721120000_reflection_push_reminders.sql` adds two closed service-role tables used only for neutral Web Push delivery:

- `push_subscriptions`: endpoint capability and browser encryption keys;
- `reminder_jobs`: due time, timezone, locale, opaque local entity id and delivery state.

Both tables have RLS enabled with no client policies. Due jobs are claimed idempotently through service-role functions and dispatched by the scheduled `send-reflection-reminders` Edge Function. No note body, AI answer, possible cause or task title is stored in these tables.

Supabase project ref: `bsikxrsguwketlloflgi`

## Source Of Truth

- `supabase/migrations/` stores schema changes.
- `supabase/schema.sql` can store a generated schema snapshot.
- `supabase/seed.sql` stores optional local seed data.
- `lib/database.types.ts` should be generated from the remote schema when the API surface changes.

## Challenge reward amounts

Challenge completion rewards use two numeric columns: `challenges.core_reward_amount` and `challenges.wallet_reward_amount`. The UI adds the `Core`/`Wallet` labels and currency formatting. `settle_user_challenge_rewards(user_id, challenge_id)` reads the stored values and settles both balances in one transaction; `user_challenges` keeps both amounts as the completion snapshot.

The migrations `20260912192306_challenge_dual_account_rewards.sql` and `20260913090000_peer_review_dual_account_rewards.sql` are an expand/contract change. Legacy `reward_label`, `reward_amount`, `reward_account`, and `review_reward_amount` columns remain temporarily so an already deployed API can continue serving traffic. Peer-review answers also keep `reward_amount` as a compatibility mirror while their Core/Wallet snapshots are stored separately. Remove the legacy columns only after the new application version is deployed and the three reward cases (Core, Wallet, and both) have been manually verified.

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
