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
assert.doesNotMatch(route, /getServiceClient|supabase|\.rpc\(/i, "the decompose route has no direct database access; quota goes through toolGuard");

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

const { normalizeBrainDumpItems, MAX_FOCUS_ITEMS } = await import("../lib/braindump.ts");
const dump = normalizeBrainDumpItems([
  { text: "Call the bank", bucket: "today" },
  { text: "Send the report", bucket: "now" },
  { text: "send the report", bucket: "now" },
  { text: "Book a dentist", bucket: "today" },
  { text: "Pay rent", bucket: "today" },
  { text: "Fix the shelf", bucket: "later" },
  { text: "Worry about the future", bucket: "drop" },
  { text: "Bad bucket", bucket: "whenever" },
  { text: "", bucket: "now" }
]);
assert.equal(dump.filter((item) => item.text.toLowerCase() === "send the report").length, 1, "duplicates are removed");
assert.ok(!dump.some((item) => item.text === "Bad bucket"), "unknown buckets are dropped");
assert.equal(dump.filter((item) => item.bucket === "now" || item.bucket === "today").length, MAX_FOCUS_ITEMS, "now + today is capped at three");
assert.equal(dump.find((item) => item.text === "Send the report").bucket, "now", "now keeps its focus slot first");
assert.equal(dump.find((item) => item.text === "Pay rent").bucket, "later", "overflow moves to later");

const { hasSafetyText } = await import("../lib/ai/safety.ts");
assert.ok(hasSafetyText("Не хочу жить так"), "safety text is detected");
assert.ok(!hasSafetyText("Buy milk and call mum"));
const triage = readFileSync("app/api/ai/notes/triage/route.ts", "utf8");
assert.match(triage, /capability: "notes\.triage"/);
assert.match(triage, /<private_dump>/);
assert.match(triage, /hasSafetyText\(text\)/, "triage must stop on safety language before calling AI");
assert.doesNotMatch(triage, /getServiceClient|supabase|\.rpc\(/i, "the triage route has no direct database access; quota goes through toolGuard");
const dumpModal = readFileSync("components/BrainDumpModal.tsx", "utf8");
assert.doesNotMatch(dumpModal, /saveNote\(\{[^}]*text\b[^}]*body: text/, "the raw dump is never saved as a note");

const { cleanDecisionOptions, normalizeDecision } = await import("../lib/decision.ts");
assert.deepEqual(cleanDecisionOptions(["  A ", "a", "B", "", "C", "D", "E"]), ["A", "B", "C", "D"], "options are unique and capped at four");
assert.deepEqual(normalizeDecision({ choice: 1, reason: " Easier to start ", firstStep: "Open it" }, 3), { choice: 1, reason: "Easier to start", firstStep: "Open it" });
assert.equal(normalizeDecision({ choice: 5, reason: "x" }, 3), null, "an out-of-range choice is rejected");
assert.equal(normalizeDecision({ choice: 0, reason: "" }, 3), null, "a decision needs a reason");

const { normalizeRoutinePlan } = await import("../lib/routinePlan.ts");
const routine = normalizeRoutinePlan({
  days: [{ offset: 2, title: "Soup" }, { offset: 0, title: "Pasta" }, { offset: 0, title: "Duplicate day" }, { offset: 9, title: "Out of range" }, { offset: 1, title: "" }],
  shopping: ["Pasta", "pasta", "Tomatoes", ...Array.from({ length: 40 }, (_, index) => `Item ${index}`)]
});
assert.deepEqual(routine.days.map((day) => day.offset), [0, 2], "days are unique, in range and sorted");
assert.ok(routine.shopping.length <= 20, "the shopping list fits one task's subtasks");
assert.equal(routine.shopping.filter((item) => item.toLowerCase() === "pasta").length, 1);
assert.equal(normalizeRoutinePlan({ days: [] }), null);
const { MAX_SHOPPING_ITEMS } = await import("../lib/routinePlan.ts");
const { MAX_TASK_SUBTASKS } = await import("../lib/taskSteps.ts");
assert.equal(MAX_SHOPPING_ITEMS, MAX_TASK_SUBTASKS, "the shopping list must fit one task");

for (const [path, capability, tag] of [
  ["app/api/ai/decisions/choose/route.ts", "decision.choose", "<decision_data>"],
  ["app/api/ai/routines/plan/route.ts", "routine.plan", "<routine_request>"]
]) {
  const source = readFileSync(path, "utf8");
  assert.match(source, new RegExp(`capability: "${capability.replace(".", "\.")}"`));
  assert.ok(source.includes(tag), `${path} wraps user data in ${tag}`);
  assert.match(source, /hasSafetyText\(/, `${path} must stop on safety language before calling AI`);
  assert.doesNotMatch(source, /getServiceClient|supabase|\.rpc\(/i, `${path} has no direct database access; quota goes through toolGuard`);
}
assert.match(readFileSync("components/DecisionModal.tsx", "utf8"), /taskId/, "existing tasks are opened, not duplicated");
assert.match(readFileSync("components/RoutinePlanModal.tsx", "utf8"), /saveTask\(/, "routine days become ordinary local tasks");
