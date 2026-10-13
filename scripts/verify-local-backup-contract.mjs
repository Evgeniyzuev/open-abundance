import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKUP_FORMAT,
  decideMerge,
  parseBackup,
  shouldRemindBackup,
  swapUserId,
  USER_TOKEN
} from "../lib/localBackupFormat.ts";

// Only real backups of a supported version are accepted.
assert.equal(parseBackup(null), null);
assert.equal(parseBackup({ format: "other", version: 1, stores: {} }), null);
assert.equal(parseBackup({ format: BACKUP_FORMAT, version: 99, stores: {} }), null, "future versions are refused");
assert.equal(parseBackup({ format: BACKUP_FORMAT, version: 1, stores: { notes: "x" } }), null);

const parsed = parseBackup({
  format: BACKUP_FORMAT,
  version: 1,
  exportedAt: "2026-10-13T10:00:00.000Z",
  stores: { notes: [{ id: "n1", updatedAt: "2026-10-01T00:00:00.000Z" }, { title: "no id" }, null], unknownStore: [{ id: "x" }] },
  settings: {
    openAbundanceLocale: "ru",
    "open-abundance-primary-wish:{user}": "{\"id\":\"w1\"}",
    "open-abundance-analytics-id": "leak",
    openAbundanceExchangeRates: "{}",
    "open-abundance:last-local-backup": "1"
  }
});
assert.deepEqual(parsed.stores.notes.map((note) => note.id), ["n1"], "records without an id are dropped");
assert.ok(!("unknownStore" in parsed.stores), "unknown stores are ignored");
assert.deepEqual(Object.keys(parsed.settings).sort(), ["open-abundance-primary-wish:{user}", "openAbundanceLocale"], "service keys never travel in a backup");

// Merge never loses newer local work.
assert.equal(decideMerge(undefined, { id: "a" }), "add");
assert.equal(decideMerge({ id: "a", updatedAt: "2026-10-02T00:00:00Z" }, { id: "a", updatedAt: "2026-10-01T00:00:00Z" }), "keep");
assert.equal(decideMerge({ id: "a", updatedAt: "2026-10-01T00:00:00Z" }, { id: "a", updatedAt: "2026-10-01T00:00:00Z" }), "keep");
assert.equal(decideMerge({ id: "a", updatedAt: "2026-10-01T00:00:00Z" }, { id: "a", updatedAt: "2026-10-03T00:00:00Z" }), "update");
assert.equal(decideMerge({ id: "a" }, { id: "a" }), "keep", "records without timestamps (check-offs) are idempotent");

// The account id is replaced in AI records and restored for the importing account.
const chat = { id: "settings:user-1", userId: "user-1", title: "user-1 stays in text" };
const exported = swapUserId(chat, "user-1", USER_TOKEN);
assert.equal(exported.userId, USER_TOKEN);
assert.equal(exported.id, `settings:${USER_TOKEN}`);
assert.equal(exported.title, "user-1 stays in text", "message text is not rewritten");
assert.equal(swapUserId(exported, USER_TOKEN, "user-2").userId, "user-2");

// Reminder is quiet until there is something worth keeping.
const day = 86_400_000;
const now = Date.parse("2026-10-13T12:00:00Z");
assert.equal(shouldRemindBackup({ now, oldestRecordAt: null, newestRecordAt: null, lastBackupAt: null, snoozedUntil: null }), false);
assert.equal(shouldRemindBackup({ now, oldestRecordAt: now - 2 * day, newestRecordAt: now, lastBackupAt: null, snoozedUntil: null }), false);
assert.equal(shouldRemindBackup({ now, oldestRecordAt: now - 8 * day, newestRecordAt: now, lastBackupAt: null, snoozedUntil: null }), true);
assert.equal(shouldRemindBackup({ now, oldestRecordAt: now - 90 * day, newestRecordAt: now - 40 * day, lastBackupAt: now - 31 * day, snoozedUntil: null }), false, "nothing changed since the last copy");
assert.equal(shouldRemindBackup({ now, oldestRecordAt: now - 90 * day, newestRecordAt: now, lastBackupAt: now - 31 * day, snoozedUntil: null }), true);
assert.equal(shouldRemindBackup({ now, oldestRecordAt: now - 90 * day, newestRecordAt: now, lastBackupAt: now - 31 * day, snoozedUntil: now + day }), false);

// The feature stays on the device and never deletes local records.
const io = readFileSync("lib/localBackup.ts", "utf8");
const dialog = readFileSync("components/LocalBackupDialog.tsx", "utf8");
for (const [name, source] of [["lib/localBackup.ts", io], ["components/LocalBackupDialog.tsx", dialog]]) {
  assert.doesNotMatch(source, /fetch\(|supabase/i, `${name} must not call the server`);
}
assert.doesNotMatch(io, /\.delete\(|\.clear\(|deleteDatabase/, "import must never delete local data");
assert.match(io, /getItem\(key\) === null/, "existing device settings are not overwritten");

console.log("Local backup contract verified.");
