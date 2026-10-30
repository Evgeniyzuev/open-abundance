import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canCheckIn, cleanDuoCode, cleanDuoNote, duoProgress } from "../lib/duoQuest.ts";

const duo = { startedOn: "2026-10-30", days: 7, neededDays: 5, inviterUserId: "a", partnerUserId: "b" };
const days = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
const marks = (user, count) => days.slice(0, count).map((day) => ({ userId: user, day, note: "step" }));

let progress = duoProgress(duo, [], "a", "2026-10-30");
assert.equal(progress.dayIndex, 0);
assert.ok(canCheckIn(progress, 7), "the first day can be marked");
progress = duoProgress(duo, marks("a", 1), "a", "2026-10-30");
assert.ok(!canCheckIn(progress, 7), "one mark a day");
progress = duoProgress(duo, [...marks("a", 5), ...marks("b", 4)], "b", "2026-11-03");
assert.equal(progress.myCount, 4);
assert.equal(progress.theirCount, 5);
assert.ok(!progress.succeeded, "both need 5 days");
progress = duoProgress(duo, [...marks("a", 5), ...marks("b", 5)], "a", "2026-11-03");
assert.ok(progress.succeeded, "5 + 5 succeeds before the week ends");
progress = duoProgress(duo, [...marks("a", 5), ...marks("b", 3)], "a", "2026-11-06");
assert.ok(progress.over && !progress.succeeded, "the week ran out");
assert.ok(!canCheckIn(progress, 7));
progress = duoProgress(duo, [{ userId: "a", day: "2026-11-09", note: "late" }], "a", "2026-11-04");
assert.equal(progress.myCount, 0, "marks outside the window do not count");

assert.equal(cleanDuoNote("  a  "), null);
assert.equal(cleanDuoNote("x".repeat(500)).length, 200);
assert.equal(cleanDuoCode("abc123def0"), "abc123def0");
assert.equal(cleanDuoCode("../x"), null);

const migration = readFileSync(new URL("../supabase/migrations/20261030150000_duo_quest.sql", import.meta.url), "utf8");
assert.ok(migration.includes("unique (duo_id, user_id, day)"), "one mark a day per person in the database");
assert.ok(migration.includes("'duo_week'"));
const check = readFileSync(new URL("../app/api/challenges/check/route.ts", import.meta.url), "utf8");
assert.ok(check.includes("DUO_LOGIC") && check.includes('"succeeded"'), "the reward needs a succeeded duo");
const invite = readFileSync(new URL("../app/i/[code]/page.tsx", import.meta.url), "utf8");
assert.ok(invite.includes('target.set("duo", duo)'), "the invitation link keeps the duo code");
console.log("duo quest contract ok");
