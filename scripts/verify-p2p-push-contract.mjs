import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readSocialSource } from "./lib/splitSources.mjs";
// Run with: node scripts/verify-p2p-push-contract.mjs
const read = (path) => readFileSync(path, "utf8");

const sql = read("supabase/migrations/20261011240000_p2p_push_category.sql");
assert.match(sql, /'social', 'p2p', 'system'/, "p2p is its own category");
assert.match(sql, /category not in \('deals', 'disputes', 'wallet', 'rewards', 'system', 'p2p'\) or in_app_enabled/, "the deal history stays in the app");
assert.match(sql, /p_event_type not like 'p2p\.order\.%'/, "only deal events are re-addressed");
assert.match(sql, /continue when v_recipient is null or v_recipient is not distinct from v_actor/, "nobody is told about their own action");
assert.match(sql, /v_actor := v_order\.requester_user_id/, "the requester of a deal is not told about the request");
assert.match(sql, /coalesce\(profile\.default_locale, preference\.locale, 'en'\)/, "the push language follows the profile");
assert.match(sql, /p_push boolean/, "the push is an explicit switch");
// Every deal event type has its own concrete text; amounts appear in the copy.
for (const kind of ["created", "accept_order", "reject_order", "mark_paid", "confirm_received", "cancel", "open_dispute", "appeal", "payment_timeout", "review_required", "dispute_resolved", "resolution_corrected", "message"]) {
  assert.match(sql, new RegExp(`when '${kind}' then`), `copy for ${kind}`);
}
assert.match(sql, /r_ru \|\| ' ₽'/, "the amount in roubles is named");
assert.match(sql, /w_ru \|\| ' \$'/, "the Wallet amount is named");
// Other notifications stay in-app only (see the earlier migration).
assert.match(read("supabase/migrations/20261011210000_no_generic_push_deliveries.sql"), /Generic push removed/);

const edge = read("supabase/functions/send-reflection-reminders/index.ts");
assert.match(edge, /delivery\.title\?\.trim\(\) \|\| "Open Abundance"/, "the push carries the concrete title");
assert.match(edge, /urgency: delivery\.category === "p2p" \? "high" : "normal"/, "deal pushes are urgent");

const messages = read("app/api/p2p/orders/[orderId]/messages/route.ts");
assert.match(messages, /p_source_type: "p2p_order"/, "the message event uses the real function arguments");
assert.doesNotMatch(messages, /p_entity_type/, "the old wrong argument names are gone");
assert.match(messages, /filter\(\(id\) => id !== auth\.user\.id\)/, "the sender is not told about their own message");

assert.match(read("app/api/notifications/route.ts"), /metadata\?\.copy\?\.\[locale\]/, "the in-app list shows the concrete text");
assert.match(read("app/api/notifications/preferences/route.ts"), /"p2p", "system"\] as const/);
assert.match(readSocialSource(), /"social", "p2p", "system"\] as const/, "the settings list has the category");

console.log("p2p push contract ok");
