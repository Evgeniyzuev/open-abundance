import assert from "node:assert/strict";
import { buildWeeklyWishState, weekStartMs } from "../lib/weeklyWishes.ts";

// Tuesday 2026-11-10 15:00 UTC belongs to the week Monday 9 .. Sunday 15.
const now = Date.UTC(2026, 10, 10, 15);
assert.equal(new Date(weekStartMs(now)).toISOString(), "2026-11-09T00:00:00.000Z");
assert.equal(new Date(weekStartMs(Date.UTC(2026, 10, 15, 23, 59))).toISOString(), "2026-11-09T00:00:00.000Z", "Sunday is the last day of the week");
assert.equal(new Date(weekStartMs(Date.UTC(2026, 10, 16))).toISOString(), "2026-11-16T00:00:00.000Z");

const none = buildWeeklyWishState({ now, activeWishes: 0, stepsThisWeek: 3, fulfilledTotal: 3 });
assert.equal(none.next, "add_wish");
assert.equal(none.participating, false, "steps without a wish do not take part");
assert.equal(none.weekStart, "2026-11-09");
assert.equal(none.weekEnd, "2026-11-15");
assert.equal(none.daysLeft, 6);

const wishOnly = buildWeeklyWishState({ now, activeWishes: 2, stepsThisWeek: 0, fulfilledTotal: 0 });
assert.equal(wishOnly.next, "make_step");
assert.equal(wishOnly.participating, false);

const taking = buildWeeklyWishState({ now, activeWishes: 1, stepsThisWeek: 2, fulfilledTotal: 0 });
assert.equal(taking.next, "keep_going");
assert.equal(taking.participating, true);
assert.equal(taking.stepsThisWeek, 2);

assert.equal(buildWeeklyWishState({ now: Date.UTC(2026, 10, 15, 23, 30), activeWishes: 1, stepsThisWeek: 1, fulfilledTotal: 0 }).daysLeft, 1, "never zero days left");
console.log("weekly wishes contract ok");
