import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeWeekRecap, hasWeekActivity, isRecapPromptDay, lastSevenDays, recapWeekKey } from "../lib/weekRecap.ts";

const today = "2026-10-13";
assert.deepEqual(lastSevenDays(today), ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
assert.deepEqual(lastSevenDays("2026-03-02").slice(0, 2), ["2026-02-24", "2026-02-25"], "crosses month boundaries");

const noonLocal = (day) => new Date(`${day}T12:00:00`).toISOString();
const recap = computeWeekRecap({
  today,
  tasks: [
    { id: "a", completed: true, updatedAt: noonLocal("2026-10-12") },
    { id: "b", completed: true, deleted: true, updatedAt: noonLocal("2026-10-12") },
    { id: "c", completed: true, updatedAt: noonLocal("2026-09-30") },
    { id: "d", completed: false, updatedAt: noonLocal("2026-10-13") }
  ],
  completions: [
    { taskId: "x", localDate: "2026-10-09", type: "done" },
    { taskId: "x", localDate: "2026-10-10", type: "done" },
    { taskId: "y", localDate: "2026-10-10", type: "done" },
    { taskId: "x", localDate: "2026-10-11", type: "done" },
    { taskId: "x", localDate: "2026-10-12", type: "life" },
    { taskId: "x", localDate: "2026-10-01", type: "done" }
  ],
  notes: [{ createdAt: noonLocal("2026-10-08") }, { createdAt: noonLocal("2026-10-08"), deleted: true }, { createdAt: noonLocal("2026-09-01") }]
});
assert.deepEqual(recap.perDay, [0, 0, 1, 2, 1, 0, 0], "lives are not counted as work; old days are outside the week");
assert.equal(recap.activeDays, 3);
assert.equal(recap.checkIns, 4);
assert.equal(recap.bestRun, 3);
assert.equal(recap.tasksFinished, 1, "deleted and older tasks are excluded");
assert.equal(recap.notesWritten, 1);
assert.equal(hasWeekActivity(recap), true);
assert.equal(hasWeekActivity(computeWeekRecap({ today, tasks: [], completions: [], notes: [] })), false);

assert.equal(isRecapPromptDay("2026-10-11"), true, "Sunday");
assert.equal(isRecapPromptDay("2026-10-12"), true, "Monday");
assert.equal(isRecapPromptDay("2026-10-13"), false, "Tuesday");
assert.equal(recapWeekKey("2026-10-12"), "2026-10-06");

// Weekly review: loose ends are past one-time tasks that are still open, oldest first.
const { findOverdueTasks } = await import("../lib/weekRecap.ts");
const looseEnds = findOverdueTasks([
  { id: "late", completed: false, schedule: { type: "once", date: "2026-10-10" } },
  { id: "older", completed: false, schedule: { type: "once", date: "2026-10-02" } },
  { id: "today", completed: false, schedule: { type: "once", date: "2026-10-13" } },
  { id: "done", completed: true, schedule: { type: "once", date: "2026-10-01" } },
  { id: "deleted", completed: false, deleted: true, schedule: { type: "once", date: "2026-10-01" } },
  { id: "daily", completed: false, schedule: { type: "daily", startDate: "2026-10-01" } }
], today);
assert.deepEqual(looseEnds.map((task) => task.id), ["older", "late"]);

const store = readFileSync("lib/tasksStore.ts", "utf8");
assert.match(store, /export async function rescheduleOnceTask/);
assert.match(store, /return rescheduleOnceTask\(taskId, addDays\(task\.schedule\.date, 1\)\)/, "postpone reuses the same rescheduling");
const review = readFileSync("components/WeekRecapModal.tsx", "utf8");
assert.match(review, /resolveOverdue\(task, "today"/);
assert.match(review, /resolveOverdue\(task, "tomorrow"/);
assert.match(review, /resolveOverdue\(task, "let_go"/);
assert.match(review, /await deleteTask\(task\.id\)/, "letting go is a soft delete that stays in the archive");
assert.doesNotMatch(review, /purgeTask/, "the review never deletes permanently");

// Gentle return: after a break with loose ends, a welcome back on any day; otherwise the weekly line on Sun/Mon.
const { daysSinceVisit, pickRecapPrompt } = await import("../lib/weekRecap.ts");
assert.equal(daysSinceVisit(null, today), null);
assert.equal(daysSinceVisit("2026-10-09", today), 4);
assert.equal(daysSinceVisit("2026-03-28", "2026-03-30"), 2, "daylight saving does not shift the count");
assert.equal(pickRecapPrompt({ today, hasActivity: false, overdueCount: 2, daysSinceVisit: 4 }), "return");
assert.equal(pickRecapPrompt({ today, hasActivity: true, overdueCount: 0, daysSinceVisit: 4 }), null, "a return without loose ends leaves Home quiet (Nova already says welcome back)");
assert.equal(pickRecapPrompt({ today, hasActivity: true, overdueCount: 2, daysSinceVisit: 1 }), null, "Tuesday without a break: nothing");
assert.equal(pickRecapPrompt({ today: "2026-10-12", hasActivity: true, overdueCount: 0, daysSinceVisit: 1 }), "weekly");
assert.equal(pickRecapPrompt({ today: "2026-10-12", hasActivity: false, overdueCount: 0, daysSinceVisit: null }), null);

// Attention settings stay on the device and apply before first paint.
const attention = await import("../lib/attention.ts");
const root = { dataset: {} };
attention.applyAttentionSettings({ focusMode: true, reducedMotion: true }, root);
assert.deepEqual(root.dataset, { focusMode: "on", motion: "reduced" });
attention.applyAttentionSettings({ focusMode: false, reducedMotion: false }, root);
assert.deepEqual(root.dataset, {});
const layout = readFileSync("app/layout.tsx", "utf8");
assert.match(layout, /open-abundance:focus-mode/, "focus mode is applied before first paint");
assert.match(layout, /open-abundance:reduce-motion/);
const css = readFileSync("app/globals.css", "utf8");
assert.match(css, /data-focus-mode="on"\] \.expedition-entry-card/);
assert.match(css, /data-motion="reduced"\] \*/);

// Only numbers leave the device, and only when the person shares.
const modal = readFileSync("components/WeekRecapModal.tsx", "utf8");
assert.doesNotMatch(modal, /fetch\(|supabase/i, "the recap is built from on-device data");
assert.doesNotMatch(modal, /fillText\([^)]*\b(task|note|item)s?\.(title|body)/, "task titles and note text are never drawn on the share image");
assert.match(modal, /shareOrDownloadFile\(/);
const backup = readFileSync("components/LocalBackupDialog.tsx", "utf8");
assert.match(backup, /shareOrDownloadFile\(/, "one shared helper for share-or-download");

console.log("Week recap contract verified.");
