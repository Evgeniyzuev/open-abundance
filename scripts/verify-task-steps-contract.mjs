import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_SUGGESTED_STEPS, normalizeStepSuggestions } from "../lib/taskSteps.ts";

const steps = normalizeStepSuggestions(
  [
    { text: "  Open the file  ", minutes: 2 },
    { text: "open the file", minutes: 5 },
    { text: "Already there", minutes: 3 },
    { text: "", minutes: 3 },
    "Plain string step",
    { text: "Huge", minutes: 9999 },
    { text: "Zero", minutes: 0 },
    ...Array.from({ length: 10 }, (_, index) => ({ text: `Extra ${index}`, minutes: 5 }))
  ],
  ["already there"]
);
assert.equal(steps[0].text, "Open the file");
assert.equal(steps.filter((step) => step.text.toLowerCase() === "open the file").length, 1, "duplicates are removed");
assert.ok(!steps.some((step) => step.text === "Already there"), "existing steps are not suggested again");
assert.ok(steps.length <= MAX_SUGGESTED_STEPS, "step count is capped");
assert.ok(steps.every((step) => step.minutes >= 1 && step.minutes <= 240), "minutes are clamped");
assert.deepEqual(normalizeStepSuggestions("nope"), []);

const route = readFileSync("app/api/ai/tasks/decompose/route.ts", "utf8");
assert.match(route, /capability: "task\.decompose"/);
assert.match(route, /<task_data>/);
assert.doesNotMatch(route, /getServiceClient|supabase|\.rpc\(/i, "the decompose route must not touch the database");

const store = readFileSync("lib/tasksStore.ts", "utf8");
assert.match(store, /export async function toggleTaskSubtask/);
assert.match(store, /export async function appendTaskSubtasks/);
assert.match(store, /doneSubtasks: existing\?\.doneSubtasks/, "saveTask must keep checked subtasks");

console.log("Task steps contract verified.");

const home = readFileSync("components/HomeTodayApp.tsx", "utf8");
assert.match(home, /<TaskStepSuggester[\s\S]*?autoStart/, "Home help-me-start must use the shared step suggester");
assert.match(home, /home\.path\.helpReply/, "the canned reply stays as the offline/failure fallback");
const homeTasks = readFileSync("components/HomeTasksCard.tsx", "utf8");
assert.match(homeTasks, /MAX_VISIBLE_TASKS = 3/);
assert.doesNotMatch(homeTasks, /fetch\(|supabase/i, "Home tasks card reads only local data");
assert.match(readFileSync("lib/tasksStore.ts", "utf8"), /TASKS_CHANGED_EVENT/);

const { addDays, getQuickReminderTime, getWeekDays } = await import("../lib/taskSchedule.ts");
assert.equal(addDays("2026-10-31", 1), "2026-11-01");
assert.equal(getWeekDays("2026-10-13").length, 7);
const noon = new Date(2026, 9, 13, 12, 0, 0);
assert.equal(getQuickReminderTime("hour", noon).getTime() - noon.getTime(), 3_600_000);
assert.equal(getQuickReminderTime("evening", noon).getHours(), 19);
assert.equal(getQuickReminderTime("evening", noon).getDate(), 13);
assert.equal(getQuickReminderTime("evening", new Date(2026, 9, 13, 18, 55)).getDate(), 14, "a too-near evening moves to tomorrow");
assert.equal(getQuickReminderTime("tomorrow", noon).getDate(), 14);
assert.match(readFileSync("components/TasksApp.tsx", "utf8"), /cancelActionReminder/);
