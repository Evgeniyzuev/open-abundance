import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixed = readFileSync(new URL("../supabase/migrations/20261016140000_usdt_scan_for_bound_senders.sql", import.meta.url), "utf8");
const previous = readFileSync(new URL("../supabase/migrations/20261010120000_usdt_deposit_scan_schedule.sql", import.meta.url), "utf8");

const body = (sql) => sql.slice(sql.indexOf("create or replace function public.run_ton_deposit_pipeline()"));
const before = body(previous);
const after = body(fixed);

// Nothing the pipeline did before is lost: every dispatch and every condition of the old version stays.
for (const part of [
  "perform pg_advisory_xact_lock(hashtext('open-abundance-ton-deposit-pipeline'))",
  "perform public.dispatch_ton_deposit_scan()",
  "perform public.dispatch_ton_deposit_settlement()",
  "perform public.dispatch_ton_usdt_deposit_scan()",
  "perform public.dispatch_ton_usdt_deposit_settlement()",
  "from public.ton_deposit_settlement_retries",
  "from public.ton_usdt_deposit_settlement_retries",
  "status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')"
]) {
  assert.ok(before.includes(part), `the previous pipeline had: ${part}`);
  assert.ok(after.includes(part), `the new pipeline keeps: ${part}`);
}

// The new rule: scan once a minute while a sender is bound (the job runs every 30 seconds).
assert.ok(after.includes("extract(second from now()) < 30"), "one scan a minute: only the ticks in the first half of a minute");
assert.ok(after.includes("exists (select 1 from public.ton_usdt_bound_senders)"), "the scan runs for bound senders");
assert.ok(/revoke all on function public\.run_ton_deposit_pipeline\(\) from public, anon, authenticated;/.test(after), "the function stays closed to clients");
assert.ok(!/cron\.schedule|cron\.unschedule/.test(fixed), "the existing 30-second job is reused, no second job");
console.log("USDT bound-sender scan contract verified.");
