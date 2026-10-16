import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterburnPreview, normalizeAfterburnKeepAmount } from "../lib/coreAfterburn.ts";

// Kept amount: cents, 0 or more, comma decimals accepted.
assert.equal(normalizeAfterburnKeepAmount("2,5"), 2.5);
assert.equal(normalizeAfterburnKeepAmount(""), 0);
assert.equal(normalizeAfterburnKeepAmount(undefined), 0);
assert.equal(normalizeAfterburnKeepAmount(1.239), 1.24);
assert.equal(normalizeAfterburnKeepAmount(-1), null);
assert.equal(normalizeAfterburnKeepAmount("abc"), null);

// Preview uses the night job rounding: down to cents, nothing below one cent.
assert.equal(afterburnPreview(10.5, 2), 8.5);
assert.equal(afterburnPreview(7.239, 0), 7.23);
assert.equal(afterburnPreview(1.005, 1), 0);
assert.equal(afterburnPreview(1, 5), 0);

const migration = readFileSync(new URL("../supabase/migrations/20261016130000_core_afterburn.sql", import.meta.url), "utf8");
// The move goes through the existing top-up with a per-night idempotency key.
assert.match(migration, /public\.wallet_core_topup\(\s*setting\.user_id,\s*free_amount,/);
assert.match(migration, /'afterburn:' \|\| p_run_date::text \|\| ':' \|\| setting\.user_id::text/);
assert.ok(!/update public\.(core|wallet)_accounts/.test(migration), "balances change only inside wallet_core_topup");
// Same skips as the accrual, plus P2P debtors, and the pause.
assert.match(migration, /request\.status in \('requested', 'reserved', 'processing', 'paid', 'failed'\)/);
assert.match(migration, /system_emissions_paused/);
assert.match(migration, /p2p_recovery_claims/);
// One failure does not stop the night.
assert.match(migration, /exception when others then/);
// Order in the night job: Afterburn, then the accrual, then the team bonus.
const job = migration.slice(migration.indexOf("create or replace function public.run_daily_core_and_team_bonus"));
const order = ["run_daily_afterburn(p_run_date)", "run_daily_core_accrual(p_run_date)", "run_daily_team_bonus(p_run_date)"].map((call) => job.indexOf(call));
assert.ok(order.every((index) => index > 0) && order[0] < order[1] && order[1] < order[2], "Afterburn runs before the accrual");
assert.match(migration, /revoke all on function public\.run_daily_afterburn\(date\) from public, anon, authenticated;/);
// Settings are written only by the server: the browser may only read its own row.
assert.match(migration, /revoke all on public\.core_afterburn_settings from public, anon, authenticated;\s*grant select on public\.core_afterburn_settings to authenticated;/);
assert.match(migration, /'afterburn_over_5'/);

const check = readFileSync(new URL("../app/api/challenges/check/route.ts", import.meta.url), "utf8");
assert.match(check, /verification_logic === "afterburn_over_5"[\s\S]{0,400}\.gt\("amount", 5\)/, "the challenge counts one move above $5");

const panel = readFileSync(new URL("../components/CoreAfterburnPanel.tsx", import.meta.url), "utf8");
assert.ok(!/rpc\(|wallet_core_topup/.test(panel), "the panel only saves the setting");
console.log("Core Afterburn contract verified.");
