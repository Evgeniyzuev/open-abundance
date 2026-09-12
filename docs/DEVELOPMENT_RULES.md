# Development Rules

## Always Read These Rules

At the start of any coding task in this repository, read this file unless it is already visible in the current context. Treat it as the project-specific operating checklist.

Do this even if the user does not mention the file in the request.

## Context And Verification Efficiency

For small, localized changes, gather context with targeted searches before reading large files end to end.

- start with `rg` or `Select-String` for the component, symbol, route, table, or CSS class that is directly involved;
- read full files only when the targeted search does not reveal the needed structure or when the change touches broad behavior;
- avoid repeating equivalent searches after the relevant owner, schema, or style block is found;
- scale verification to risk: run `pnpm exec tsc --noEmit` for TypeScript/UI contract changes, add `pnpm lint` or broader checks when the change touches shared patterns or lint-sensitive code;
- after a frontend change, attempt one visual browser check as described below; in the Codex VS Code extension on Windows, use the configured Playwright MCP browser because the built-in Browser is not available there;
- if the selected browser is unavailable or does not return a result within 30 seconds, switch to the fallback checks instead of spending time on repeated browser setup attempts.

## UTF-8 And PowerShell

Most source files in this project are UTF-8 and contain Russian UI text.

Avoid rewriting source files with broad PowerShell commands such as:

```powershell
Set-Content path -Value $text
```

This can accidentally introduce a BOM or corrupt non-ASCII text into mojibake.

Preferred editing options:

- use `apply_patch` for manual edits;
- use the app/editor for text edits;
- if a mechanical rewrite is unavoidable, explicitly preserve UTF-8 without BOM and verify the diff immediately;
- after any bulk text rewrite, check that Russian strings are readable in `git diff`.

If mojibake appears in a diff, stop and fix it before continuing.

## iOS Zoom And Input Font Size

iOS Safari may auto-zoom the page when an `<input>`, `<textarea>`, or `<select>` has `font-size: 0.9375rem` or smaller. To prevent unwanted zoom on input focus:

- keep form field font-size at `1rem` or larger;
- if a design calls for visually smaller text, reduce size with layout, spacing, or component scaling instead of dropping below `1rem` on the input itself;
- if pinch-zoom must remain enabled for accessibility, don’t rely on `user-scalable=no` to fix focus zoom — the `1rem` floor is the actual safeguard.

## Local-First IndexedDB

Personal local data for notes, tasks, streaks, and guest identity shares one IndexedDB database:

```text
open-abundance-offline
```

When adding a store or changing the local schema:

- update `DB_VERSION` in every module that opens this database;
- keep `onupgradeneeded` able to create all known stores, not only the store owned by that module;
- current known stores are `notes`, `lists`, `tasks`, `taskCompletions`, and `guestIdentity`;
- never open the same IndexedDB database with an older version from another store module.

Why this matters: after `guestIdentity` moved the shared DB to version 4, `notesStore` and `tasksStore` still opened version 3. Browsers reject that with `VersionError`, so form submit looked like the "Done" button did nothing and local-first notes/tasks/streaks stopped saving.

For MVP, notes and tasks/streaks are local-only. Do not make their create/update/delete flows wait for Supabase sync unless a dedicated sync plan is being implemented and tested offline.

## Server-Backed API Freshness

For server-source-of-truth data, do not rely on browser, CDN, or Next route caching.

Server-backed API routes that return user-specific or frequently changing data must:

- return `NO_STORE_HEADERS` from `lib/httpCache.ts`;
- include Vercel/CDN no-store headers through that shared helper;
- use `export const dynamic = "force-dynamic"` for GET route handlers;
- use `export const revalidate = 0` and `export const fetchCache = "force-no-store"` for critical GET routes such as `/api/user/context` and `/api/challenges`;
- keep client fetches on these endpoints as `cache: "no-store"` and use a timestamp query when repeated manual refreshes are possible.

Before adding complex refresh timing, race guards, or debug fields for stale server UI, first verify that the endpoint cannot be served from cache. A stale `/api/user/context` or `/api/challenges` response can make correct database writes look like UI state bugs.

Temporary API debug fields such as `debug.supabaseProjectRef`, `debug.serverReadAt`, `viewerUserId`, and counters are acceptable while diagnosing environment or cache issues, but should be removed or gated once the production deployment is confirmed fresh.

## Server-Backed Tab Lifecycle

Server-backed main tabs should use the shared keep-alive pattern from `components/KeepAliveView.tsx`:

- add the tab id to the `visitedServerViews` registry in `AppNavigation`;
- mount the view on its first visit and hide it with `hidden` instead of unmounting it;
- pass the view's `active` state so it can refresh data only when visible;
- show a loading state only before the first payload; after data is loaded, refresh in the background without replacing the existing UI.

This keeps navigation responsive and preserves local component state when users switch tabs. New server-backed tabs should follow this pattern unless they have a documented reason to remain unmounted.

## Frontend Verification

After frontend UI changes, try to verify the affected route and state visually in a browser. Browser verification supplements the technical checks; it does not replace typechecking, linting, builds, or targeted deterministic tests when those checks are relevant.

### Browser Use In Codex VS Code On Windows

The built-in Browser is not available in the Codex CLI or Codex IDE extension. In VS Code on Windows, use the Playwright MCP server for interactive browser verification.

Configure it once in `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.playwright]
command = "npx.cmd"
args = ["-y", "@playwright/mcp@latest"]
```

Requirements and startup:

- install Node.js so `npx.cmd` is available;
- after adding or changing the MCP configuration, restart VS Code and start a new Codex chat so the MCP tool catalog is rebuilt;
- confirm that Playwright browser tools are available, then perform one small navigation such as opening `https://example.com` or the relevant local route;
- the first launch may need network access to download the MCP package;
- do not expect this configuration to add an embedded browser panel to VS Code: it gives Codex browser-control tools backed by a separate Playwright browser.

For a local UI check:

1. Start or confirm the development server and identify its exact URL.
2. Navigate the Playwright MCP browser directly to the affected route.
3. Inspect the accessibility snapshot first; use a screenshot when visual layout, spacing, color, responsive behavior, or canvas output matters.
4. Check console messages or network requests only when they are relevant to the reported behavior.
5. Verify the specific desktop or mobile viewport required by the change, then close the browser or stop processes started only for verification.

Keep the interactive browser run within 30 seconds. If Playwright MCP is absent from the tool catalog after restart, cannot launch, or produces no result within that budget, record the limitation and use the fallback checks below. Do not repeatedly reinstall packages, restart VS Code, reconnect the MCP server, or rerun the same browser check during the coding task.

Playwright MCP browser verification and the repository's `pnpm test:e2e` command are separate:

- Playwright MCP is an interactive Codex tool for inspecting a rendered page;
- `pnpm test:e2e` runs the repository's committed automated test suite and follows the additional rules in "E2E Tests That Must Stay Fast" below;
- a successful MCP navigation or screenshot does not prove that the automated e2e suite passes.

Official references: [Browser availability](https://learn.chatgpt.com/docs/browser) and [Codex MCP configuration](https://developers.openai.com/codex/mcp).

If the selected browser tool is unavailable:

- state this clearly in the final result;
- run the available technical checks instead, such as `tsc --noEmit`, `next build`, and an HTTP 200 check against the local dev server when relevant;
- stop the dev server after the fallback check;
- do not present the change as visually verified.

Known built-in Browser Windows sandbox failure (observed 2026-07-20):

```text
node_repl kernel exited unexpectedly
windows sandbox failed: CreateProcessWithLogonW failed: 2
```

Treat this exact failure as definitive built-in Browser unavailability for the current task. In the VS Code extension, do not attempt the built-in Browser because that surface is unsupported; use the already configured Playwright MCP server as described above. If Playwright MCP is also unavailable or has already failed in the same verification scope, go directly to the fallback checks.

The same one-attempt rule applies when browser discovery returns no available browsers, an empty browser list, or another definitive environment-level unavailability result. Once that happens, record it for the final response and do not spend more tool calls reconnecting, rediscovering, resetting, or substituting another browser in the same verification scope.

```text
f:\git\
  abundance-effect\          old app, reference only
  abundance-effect-pwa\      new app, main repo
```

## Verification Command Habits

In this Windows workspace, `pnpm test:e2e` may fail inside the sandbox with `Access denied` before Playwright starts. When running the e2e smoke test for this repo, request escalation for `pnpm test:e2e` immediately instead of first spending a failed sandbox attempt.

`pnpm exec tsc --noEmit` updates the tracked `tsconfig.tsbuildinfo` file as a side effect. Do not commit that file when it changed only because of verification. Restore only that file after typecheck:

```powershell
git restore tsconfig.tsbuildinfo
```

Do not delete `tsconfig.tsbuildinfo`; it is a tracked TypeScript build-info file in this repo. Only revert incidental verification changes to it.

## Supabase Remote Migrations

This repository is linked to Supabase project `bsikxrsguwketlloflgi`. Before a remote migration, confirm that all three project identities agree:

- `project_id` in `supabase/config.toml`;
- `supabase/.temp/project-ref`;
- the project ref in `SUPABASE_URL` and the Postgres username/host.

The operator runbook with the verified PowerShell command is [`docs/DATABASE.md`](./DATABASE.md#remote-migration-push-verified-windows-workflow). Keep the command there and this rule in sync when the connection workflow changes.

Use the linked Supabase CLI workflow as the canonical migration path. For this project, the verified connection method is `--linked --password` with `POSTGRES_PASSWORD` read from `.env`. Do not construct a `--db-url` from `POSTGRES_URL*`: that route produced connection errors in this workspace even though the linked password route worked with the same `.env`.

Use the globally installed `supabase` CLI directly:

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

Use the regex exactly as shown, with single backslashes (`\s`). A pasted escaped form containing `\\s` does not parse `.env` assignments in PowerShell and must not be used.

Do not use `pnpm dlx supabase` as the apply fallback on this Windows workspace. It can read the linked project and report `Remote database is up to date`, but pending migration apply has repeatedly failed in its Bun/TypeScript wrapper with `LegacyDbPushApplyError` or a hanging `supabase-go` child process. If the global CLI is unavailable, perform the linked push from the configured device where the global binary works, or install a supported CLI before continuing.

Do not print the password. A personal `SUPABASE_ACCESS_TOKEN` is not required for `db push` when the project is already linked; it is required only for initial link/re-link or Management API operations. If `supabase/.temp/project-ref` is missing or points elsewhere, re-link project `bsikxrsguwketlloflgi` before pushing.

Do not treat `db push --dry-run` alone as proof that database credentials work: some CLI versions can list local pending migrations without completing a remote PostgreSQL login. A successful push must print the applied migration or `Remote database is up to date` and finish normally.

After the push, verify both:

1. `supabase migration list --linked --password $pw` shows the local timestamp in remote history. Do not substitute the unreliable `pnpm dlx` apply workflow on this Windows workspace.
2. A read-only project REST request to one of the newly created or changed tables succeeds with HTTP `200`. Use the server-side service-role key only from the local environment and never include it in command output, logs, documentation, or client code.

The project Data REST API is suitable for schema availability checks but not for applying DDL. The official Management API SQL endpoint requires a current personal access token with `database:write`; do not use it as an ad-hoc migration fallback because bypassing CLI migration history can cause later `db push` drift.

## E2E Tests That Must Stay Fast

Playwright smoke tests and their managed test server must produce a final result in less than 30 seconds. This is a hard verification budget, not a timeout to increase. If the runner has no final result within 30 seconds, terminate it once, clean up only the processes created by that run, report the infrastructure failure, and do not run Playwright again in the same session.

Local verification policy:

- run only the e2e scenarios directly affected by the change; leave the complete suite to CI unless the user explicitly requests it;
- let Playwright own a dedicated test port and test server; never reuse a developer's existing server or the default app port;
- do not manually start a dev server before Playwright;
- allow one Playwright attempt per verification scope, with no retries after a runner/server hang;
- do not diagnose a silent runner with repeated process inspection, server restarts, longer timeouts, or progressively smaller reruns;
- after an infrastructure hang, fall back to `pnpm exec tsc --noEmit`, `pnpm lint` when relevant, `pnpm build`, and one bounded HTTP 200 check;
- prefer deterministic unit/component/state tests for translations, storage consumption, reward visibility, and auth state transitions;
- keep browser e2e to one navigation path without reloads while server-backed views have active background requests.

Do not add or restore tests that loop through multiple onboarding locales with repeated page navigation, reload the app shell while server-backed views are still refreshing, or otherwise wait on open-ended navigation/background network activity.

Known removed failures (2026-07-22):

- `new guest can use Chinese, Spanish, and Hindi onboarding copy` timed out while cycling locale state in one browser test;
- `first registration reward appears once and opens the feed` hung on reload while feed navigation/background requests were active.

Cover these contracts with deterministic state/translation checks or a single-page assertion that does not navigate or reload. If an e2e test has no result within 30 seconds, remove or redesign it instead of increasing its timeout, adding retries, or keeping it in the smoke suite.

## Docs Status Updates

When implementing work that already has a matching plan or design document in `docs`, update that document with what was actually completed.

- mark completed stages, assumptions, or decisions where the document has a status/checklist section;
- if there is no checklist, add a short "Implemented" or "Current Status" note near the relevant section;
- keep the note factual: what changed, where it lives, and what remains pending;
- do not rewrite the whole plan just because one implementation detail changed;
- if no corresponding document exists, do not create one unless the task needs durable product or technical context.

## UI Text And Translations

Keep the interface quiet and purposeful. Do not add visible explanatory labels, helper text, or repeated captions unless they directly help the current user action.

When adding or changing UI text:

- reuse existing translated components, buttons, labels, and message keys where the meaning matches;
- add new text through the shared language dictionary instead of hardcoding Russian or English in TSX;
- avoid duplicating near-identical button text such as close, cancel, done, refresh, delete, and loading states;
- prefer icon buttons with accessible labels for familiar actions when the screen already makes the action clear;
- keep new message keys stable and ASCII-only.

If a reusable translated element would become awkward or misleading, create a small shared variant instead of copy-pasting text across screens.
