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

// Weekly newcomer groups for experiments.
const { bestVariant, buildCohortReport, variantOf } = await import("../lib/cohortReport.ts");
assert.equal(variantOf({ cohort_id: "w46-a", campaign: "x", acquisition_source: "tg" }), "w46-a");
assert.equal(variantOf({ campaign: "hook-wish", acquisition_source: "tg" }), "hook-wish");
assert.equal(variantOf({ acquisition_source: "telegram" }), "telegram");
assert.equal(variantOf(null), "direct");
const person = (id, day, extra = {}) => ({ id, registeredAt: `2026-11-${day}T10:00:00Z`, wishes: 0, challengesCompleted: 0, returnedDay2: false, referralsInvited: 0, outcomeAnswers: [], ...extra });
const people = [
  ...Array.from({ length: 6 }, (_, i) => person(`a${i}`, "03", { returnedDay2: i < 3, wishes: 1 })),
  ...Array.from({ length: 5 }, (_, i) => person(`b${i}`, "04", { returnedDay2: i < 1 })),
  person("c0", "05"),
  person("old", "01", { registeredAt: "2026-08-01T00:00:00Z" })
];
const variantMap = new Map([...people.filter((p) => p.id.startsWith("a")).map((p) => [p.id, "hook-a"]), ...people.filter((p) => p.id.startsWith("b")).map((p) => [p.id, "hook-b"]), ["c0", "solo"]]);
const rows = buildCohortReport({ people, variants: variantMap, now });
assert.deepEqual(rows.map((row) => [row.week, row.variant, row.people]), [["2026-11-02", "hook-a", 6], ["2026-11-02", "hook-b", 5], ["2026-11-02", "другое", 1]], "small groups merge, old weeks drop out");
assert.equal(rows[0].addedWish, 6);
assert.deepEqual(bestVariant(rows), { week: "2026-11-02", variant: "hook-a", rate: 0.5 });
assert.equal(bestVariant(rows.slice(0, 1)), null, "one group is nothing to compare");
console.log("cohort report contract ok");

// The open wish fund ledger.
const { parseFundEntry, summarizeFund } = await import("../lib/wishFund.ts");
assert.equal(typeof parseFundEntry(null), "string");
assert.equal(typeof parseFundEntry({ kind: "gift", amount: 5 }), "string", "unknown kind");
assert.equal(typeof parseFundEntry({ kind: "founder", amount: 0 }), "string", "a contribution needs money");
assert.equal(typeof parseFundEntry({ kind: "money", amount: 0, title: "x" }), "string", "a money wish needs a sum");
assert.equal(typeof parseFundEntry({ kind: "help", amount: 0 }), "string", "a fulfilled wish needs a title");
assert.deepEqual(parseFundEntry({ kind: "help", title: "  Разобрать   резюме ", personDid: "3 квеста", isPublic: true, userId: "nope" }),
  { direction: "out", kind: "help", amount: 0, title: "Разобрать резюме", personDid: "3 квеста", result: "", isPublic: true, userId: null, wishId: null });
assert.equal(parseFundEntry({ kind: "patron", amount: 20.005 }).direction, "in");
const fundRow = (extra) => ({ id: Math.random().toString(), direction: "out", kind: "help", amount: 0, week_start: "2026-11-09", title: "t", person_did: "", result: "", is_public: false, created_at: "2026-11-10T00:00:00Z", ...extra });
const fund = summarizeFund([
  fundRow({ direction: "in", kind: "founder", amount: 100 }),
  fundRow({ direction: "in", kind: "patron", amount: "20.50" }),
  fundRow({ id: "pub", is_public: true, title: "Резюме", person_did: "сделал 3 шага", result: "позвали на собеседование" }),
  fundRow({ kind: "money", amount: 15, title: "секрет" }),
  fundRow({ kind: "habit", week_start: "2026-11-02", is_public: true })
]);
assert.equal(fund.received, 120.5);
assert.equal(fund.spent, 15);
assert.equal(fund.balance, 105.5);
assert.equal(fund.fulfilled, 3);
assert.equal(fund.fulfilledWithoutMoney, 2);
assert.equal(fund.contributors, 2);
assert.deepEqual(fund.weeks.map((week) => [week.weekStart, week.fulfilled, week.spent, week.entries.length, week.hidden]), [["2026-11-09", 2, 15, 1, 1], ["2026-11-02", 1, 0, 1, 0]]);
assert.ok(!JSON.stringify(fund).includes("секрет"), "a private row never leaks its title");
console.log("wish fund contract ok");
