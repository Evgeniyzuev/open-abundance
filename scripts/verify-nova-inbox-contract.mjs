import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOVA_INBOX_COOLDOWN_MS, NOVA_INBOX_PUSH_CHARS, inboxPushText, normalizeInboxBody, planInboxSend } from "../lib/novaInbox.ts";

assert.equal(normalizeInboxBody("  hi  "), null);
assert.equal(normalizeInboxBody("Привет!\n\n\n\nКак желание?"), "Привет!\n\nКак желание?");
assert.equal(normalizeInboxBody("x".repeat(801)), null);
assert.equal(normalizeInboxBody(42), null);

const long = "Слово ".repeat(60).trim();
const push = inboxPushText(long);
assert.ok(push.length <= NOVA_INBOX_PUSH_CHARS && push.endsWith("…"));
assert.equal(inboxPushText("Первая строка\nвторая"), "Первая строка");

const NOW = Date.parse("2026-10-23T12:00:00Z");
const ids = { u_a: "A", u_b: "B", u_c: "C" };
const plan = planInboxSend(["u_a", "u_b", "u_a", "u_x", "u_c"], (r) => ids[r] ?? null, new Map([["B", NOW - 3600_000], ["C", NOW - NOVA_INBOX_COOLDOWN_MS - 1]]), NOW);
assert.deepEqual(plan.send.map((item) => item.recipient), ["u_a", "u_c"]);
assert.deepEqual(plan.skipped, [{ recipient: "u_b", reason: "cooldown" }, { recipient: "u_a", reason: "duplicate" }, { recipient: "u_x", reason: "unknown_person" }]);

// The server keeps a message only until delivery: cleanup deletes delivered ones after a day and expired ones.
const migration = readFileSync(new URL("../supabase/migrations/20261023120000_nova_inbox.sql", import.meta.url), "utf8");
assert.match(migration, /delivered_at < now\(\) - interval '1 day'/);
assert.match(migration, /expires_at < now\(\)/);
assert.match(migration, /revoke all on public\.nova_inbox_messages from public, anon, authenticated/);

// The chat acknowledges only after saving on the device.
const chat = readFileSync(new URL("../components/AiChatApp.tsx", import.meta.url), "utf8");
assert.ok(chat.indexOf("await saveChat({ ...chat, userId") < chat.indexOf('method: "POST",\n          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },\n          body: JSON.stringify({ ids'));

console.log("nova inbox contract ok");
