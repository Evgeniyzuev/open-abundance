import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOCUS_DAYS_TARGET, questDays, tasksDoneSince } from "../lib/simpleQuests.ts";

const done = (id, at, extra = {}) => ({ challenge_id: id, status: "completed", reward_settled_at: at, updated_at: at, ...extra });

// «3 дня»: any days, not in a row; several tasks on one day count once; the task itself and achievements do not count.
const rows = [
  done("a", "2026-10-01T10:00:00Z"),
  done("b", "2026-10-01T18:00:00Z"),
  done("c", "2026-10-05T09:00:00Z"),
  done("focus", "2026-10-07T09:00:00Z"),
  done("ach", "2026-10-08T09:00:00Z", { category: "achievement" }),
  { challenge_id: "d", status: "accepted", reward_settled_at: null, updated_at: "2026-10-09T09:00:00Z" }
];
assert.deepEqual(questDays(rows, "focus"), ["2026-10-01", "2026-10-05"]);
assert.equal(FOCUS_DAYS_TARGET, 3);
assert.equal(questDays([...rows, done("e", "2026-10-20T09:00:00Z")], "focus").length, 3, "a third day, weeks later, counts");
assert.equal(questDays([{ challenge_id: "x", status: "completed", reward_settled_at: null, updated_at: "2026-10-02T01:00:00Z" }]).length, 1, "falls back to updated_at");

// «Помоги новичку»: only tasks completed after the helper took the task count.
assert.equal(tasksDoneSince(rows, "2026-10-04T00:00:00Z"), 2);
assert.equal(tasksDoneSince(rows, "2026-10-30T00:00:00Z"), 0);
assert.equal(tasksDoneSince(rows, null), 0);

const check = readFileSync(new URL("../app/api/challenges/check/route.ts", import.meta.url), "utf8");
assert.ok(check.includes("FOCUS_DAYS_LOGIC") && check.includes("questDays("), "the check route counts days with tasks");
assert.ok(check.includes("HELP_NEWCOMER_LOGIC") && check.includes("loadNewcomerProgress("), "the check route looks at newcomers");
const migration = readFileSync(new URL("../supabase/migrations/20261031120000_simple_focus_and_help_quests.sql", import.meta.url), "utf8");
assert.ok(/verification_type = 'auto'[\s\S]*three_day_focus/.test(migration), "«3 дня» is no longer manual");
for (const locale of ["ru", "en"]) {
  const messages = readFileSync(new URL(`../lib/messages/${locale}.ts`, import.meta.url), "utf8");
  for (const key of ["challenges.reason.focus_days", "challenges.reason.newcomer_none", "challenges.reason.newcomer_waiting", "quests.focusDays.progress", "quests.helpNewcomer.listTitle"]) {
    assert.ok(messages.includes(`"${key}"`), `${locale} has ${key}`);
  }
}
console.log("simple quests contract ok");
