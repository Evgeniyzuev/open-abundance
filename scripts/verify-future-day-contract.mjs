import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IDLE_FUTURE_DAY, computeFutureDay } from "../lib/futureDay.ts";

assert.deepEqual(computeFutureDay([], []), IDLE_FUTURE_DAY, "no planned tasks means an idle scene");
assert.deepEqual(computeFutureDay([], ["x"]), IDLE_FUTURE_DAY, "completions of unplanned tasks do not count");

assert.equal(computeFutureDay(["a", "b", "c"], []).mood, "morning");
const half = computeFutureDay(["a", "b", "c"], ["a"]);
assert.equal(half.mood, "day");
assert.equal(half.done, 1);
assert.equal(half.planned, 3);
assert.ok(Math.abs(half.ratio - 1 / 3) < 1e-9);
const all = computeFutureDay(["a", "b"], new Set(["a", "b", "other"]));
assert.equal(all.mood, "celebrate");
assert.equal(all.ratio, 1);
assert.equal(computeFutureDay(["a", "a", "b"], ["a"]).planned, 2, "a task is counted once");

// The board only reads today's data and never writes tasks.
const board = readFileSync("components/FutureBoard.tsx", "utf8");
assert.match(board, /getTasks\(\)/);
assert.match(board, /isPlannedOn\(task, today\)/);
assert.match(board, /isCompletedOn\(task\.id, today, completions\)/);
assert.doesNotMatch(board, /saveTask|completeTask|failTask|deleteTask/);

console.log("future day contract ok");
