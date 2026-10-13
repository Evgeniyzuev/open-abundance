import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeValueMetrics, PASSIVE_ONLY_IMPRESSIONS, VALUE_EVENTS } from "../lib/valueMetrics.ts";

const at = (day, hour = 10) => `2026-10-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const impressions = (user, day, count) => Array.from({ length: count }, () => ({ user_id: user, event_name: "feed_post_impression", occurred_at: at(day) }));
const metrics = computeValueMetrics([
  // Day with value: opened, acted in the daily set and finished it.
  { user_id: "u1", event_name: "app_open", occurred_at: at(13) },
  { user_id: "u1", event_name: "daily_set_action", occurred_at: at(13), properties: { kind: "adventure" } },
  { user_id: "u1", event_name: "daily_set_skipped", occurred_at: at(13) },
  { user_id: "u1", event_name: "daily_set_completed", occurred_at: at(13), properties: { actions: 3, skips: 1 } },
  // Same person, next day: only scrolling.
  ...impressions("u1", 14, PASSIVE_ONLY_IMPRESSIONS),
  // A guest who marked a task done counts too.
  { user_id: null, anonymous_id: "g1", event_name: "task_done", occurred_at: at(13) },
  // Opening the app alone is not value.
  { user_id: "u2", event_name: "app_open", occurred_at: at(13) },
  { user_id: "u2", event_name: "wish_outcome_answered", occurred_at: at(14), properties: { answer: "yes" } },
  // Rows without any identity are ignored.
  { user_id: null, event_name: "task_done", occurred_at: at(13) }
]);

assert.equal(metrics.personDays, 5, "u1×2, guest×1, u2×2");
assert.equal(metrics.valuePersonDays, 3, "u1 day 13, guest day 13, u2 day 14");
assert.equal(metrics.valueRate, 0.6);
assert.equal(metrics.passiveOnlyDays, 1, "a day of impressions without action is the doomscroll signal");
assert.equal(metrics.people, 3);
assert.equal(metrics.peopleWithValue, 3);
assert.deepEqual(metrics.dailySet, { peopleStarted: 1, completions: 1, averageActions: 3, skips: 1 });
assert.deepEqual(metrics.helpedAnswers, { yes: 1 });
assert.ok(!VALUE_EVENTS.includes("app_open") && !VALUE_EVENTS.includes("feed_post_impression"), "passive viewing never counts as value");
assert.equal(computeValueMetrics([]).valueRate, null);

const report = readFileSync("app/api/internal/growth/report/route.ts", "utf8");
assert.match(report, /value: computeValueMetrics\(events\)/);
assert.match(report, /\.range\(page \* EVENTS_PAGE_SIZE/, "events are read page by page past the 1000-row limit");
assert.match(report, /anonymous_id/, "guests are counted");

// The new value events carry counts only, never titles or text.
for (const [path, event] of [
  ["components/TasksApp.tsx", "task_done"],
  ["components/TaskStepSuggester.tsx", "task_steps_accepted"],
  ["components/BrainDumpModal.tsx", "brain_dump_created"],
  ["components/DecisionModal.tsx", "decision_task_added"],
  ["components/RoutinePlanModal.tsx", "routine_plan_created"]
]) {
  const source = readFileSync(path, "utf8");
  const call = source.slice(source.indexOf(`trackProductEvent("${event}"`), source.indexOf(`trackProductEvent("${event}"`) + 220);
  assert.ok(call.length > 0 && source.includes(`trackProductEvent("${event}"`), `${path} records ${event}`);
  assert.doesNotMatch(call.split(");")[0], /title|text|body|answer|description/, `${event} has no content`);
}

console.log("Value metrics contract verified.");
