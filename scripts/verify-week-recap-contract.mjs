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

// Only numbers leave the device, and only when the person shares.
const modal = readFileSync("components/WeekRecapModal.tsx", "utf8");
assert.doesNotMatch(modal, /fetch\(|supabase/i, "the recap is built from on-device data");
assert.doesNotMatch(modal, /fillText\([^)]*\b(task|note|item)s?\.(title|body)/, "task titles and note text are never drawn on the share image");
assert.match(modal, /shareOrDownloadFile\(/);
const backup = readFileSync("components/LocalBackupDialog.tsx", "utf8");
assert.match(backup, /shareOrDownloadFile\(/, "one shared helper for share-or-download");

console.log("Week recap contract verified.");
