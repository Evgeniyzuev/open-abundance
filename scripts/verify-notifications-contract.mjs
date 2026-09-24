import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20260915181547_notifications_center_v1.sql", "utf8");
const sender = await readFile("supabase/functions/send-reflection-reminders/index.ts", "utf8");
const serviceWorker = await readFile("public/sw.js", "utf8");
const api = await readFile("app/api/notifications/route.ts", "utf8");

for (const table of ["notification_events", "notification_recipients", "notification_preferences", "notification_deliveries"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
}
assert.match(migration, /subscription\.owner_key = 'user:' \|\| recipient\.user_id::text/, "delivery must recheck subscription ownership");
assert.match(migration, /claimed_at < now\(\) - interval '10 minutes'/, "stuck deliveries must be recovered");
assert.match(migration, /unique \(recipient_id, subscription_id\)/, "device delivery must be idempotent");
assert.match(migration, /grant update \(read_at\)/, "authenticated users may only update notification read state");
for (const source of ["wallet_ledger", "daily_core_accruals", "team_core_growth_rewards", "mutual_confirmations", "user_challenges", "team_task_events"]) {
  assert.match(migration, new RegExp(`on public\\.${source}`, "i"), `${source} must emit notification events`);
}
assert.match(sender, /Open the app to view an update\./, "push payload must use neutral lock-screen copy");
assert.doesNotMatch(sender, /\u0420[\u0400-\u04ff]/u, "push source must not contain UTF-8 mojibake literals");
assert.doesNotMatch(sender, /wallet_amount|rub_amount|price_amount/i, "push payload must not include financial amounts");
assert.match(sender, /claim_notification_deliveries/, "sender must claim notification deliveries");
assert.match(sender, /notification_delivery_allowed/, "sender must recheck source access before each push");
assert.match(sender, /complete_notification_delivery/, "sender must complete or retry notification deliveries");
assert.match(serviceWorker, /notificationclick/, "service worker must support deep-link clicks");
assert.match(api, /\.eq\("user_id", user\.id\)/, "inbox API must scope rows to the authenticated user");

console.log("Notification contract checks passed.");
