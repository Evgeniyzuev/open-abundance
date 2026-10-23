import assert from "node:assert/strict";
import { buildDailyReport, groupPeople, nextStepFor, pseudonymize, renderDeltas, DELTAS_PLACEHOLDER } from "../lib/dailyAnalytics.ts";
import { buildFixtureSnapshot } from "./fixtures/daily-analytics-fixture.mjs";

const NOW = Date.parse("2026-10-23T06:00:00Z");
const snapshot = buildFixtureSnapshot(NOW);
const report = buildDailyReport(snapshot, { salt: "test", now: NOW });

// Every section of the brief is present.
for (const heading of ["Пульс", "Воронка", "Движения людей", "Желания", "Навыки и совпадения", "комментарии", "Челленджи и проверка", "Рефералы", "Core и Wallet", "Маркетплейс", "Голос людей", "Персональные следующие шаги", "Что предлагать", "Предложения действий"]) {
  assert.ok(report.summary.includes(heading), `summary has "${heading}"`);
}
assert.ok(report.summary.includes(DELTAS_PLACEHOLDER));
assert.equal(report.metrics.users_total, 40);

// No raw user ids anywhere in the output; people appear only as pseudonyms.
const everything = report.summary + JSON.stringify(report.details);
for (const row of snapshot.tables.user_profiles) assert.ok(!everything.includes(row.user_id), "raw user id leaked");
assert.match(pseudonymize(snapshot.tables.user_profiles[0].user_id, "test"), /^u_[0-9a-f]{10}$/);
assert.equal(pseudonymize("a", "s"), pseudonymize("a", "s"));
assert.notEqual(pseudonymize("a", "s"), pseudonymize("a", "t"));

// Private wish titles never leave; public ones do.
for (const wish of snapshot.tables.wishes.filter((row) => row.visibility === "private")) {
  assert.ok(!report.details.public_wishes.some((row) => row.title === wish.title), "private wish title leaked");
}
assert.ok(report.details.public_wishes.length > 0);

// Comments only from public posts.
const publicPosts = new Set(snapshot.tables.feed_posts.filter((row) => row.visibility === "public").map((row) => row.id));
assert.ok(report.details.public_comments_7d.every((row) => publicPosts.has(row.post_id)));

// Small groups merge into "other".
const grouped = groupPeople([["a", "1"], ["a", "2"], ["b", "3"], ["c", "4"], ["c", "5"], ["c", "6"], ["c", "7"], ["c", "8"]], 5);
assert.deepEqual(grouped, [["c", 5], ["другое (2 мелких групп)", 3]]);

// Personal step ladder.
const base = { id: "x", registeredAt: "2026-10-01T00:00:00Z", coreBalance: 0, coreGrowth: { challengeRewards: 0, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 }, storiesViewed: 0, wishes: 0, calculatorUsed: false, challengesAccepted: 0, challengesCompleted: 0, feedbackSubmitted: 0, novaMessages: 0, returnedDay2: true, contentPosts: 0, externalShares: 0, referralsInvited: 0, helpProfile: null, outcomeAnswers: [], checkinAnswer: null };
const fresh = { lastActiveMs: NOW, stalledChallenge: false };
assert.equal(nextStepFor(base, { lastActiveMs: NOW - 8 * 86_400_000, stalledChallenge: false }, NOW), "return_gently");
assert.equal(nextStepFor(base, fresh, NOW), "add_first_wish");
assert.equal(nextStepFor({ ...base, wishes: 1 }, fresh, NOW), "first_challenge");
assert.equal(nextStepFor({ ...base, wishes: 1, challengesAccepted: 1 }, { ...fresh, stalledChallenge: true }, NOW), "smaller_step");
assert.equal(nextStepFor({ ...base, wishes: 1, challengesAccepted: 1, challengesCompleted: 1 }, fresh, NOW), "invite_friend");

// Day-over-day deltas.
assert.match(renderDeltas({ a: 2, b: 1 }, { a: 1, b: 1 }, "2026-10-22"), /\| a \| 1 \| 2 \| \+1 \|/);
assert.match(renderDeltas({ a: 1 }, null, null), /второго запуска/);

// A missing table is reported, not fatal.
const partial = buildDailyReport({ ...snapshot, missing: ["user_spend_intents: relation does not exist"], tables: { ...snapshot.tables, user_spend_intents: undefined } }, { salt: "test", now: NOW });
assert.ok(partial.summary.includes("Не прочитаны таблицы"));

console.log("daily analytics contract ok");
