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

// Referral program section: funnel, ways of sharing, survey answers, paid amounts and proposals.
{
  const { buildReferralReport } = await import("../lib/referralAnalytics.ts");
  const T = Date.parse("2026-10-26T12:00:00Z");
  const at = (hours) => new Date(T - hours * 3600_000).toISOString();
  const ev = (user, name, properties) => ({ user_id: user, event_name: name, occurred_at: at(5), properties });
  const report = buildReferralReport({
    product_events: [
      ...["a", "b", "c", "d", "e", "f"].map((u) => ev(u, "invite_quest_step", { step: "bonuses" })),
      ev("a", "invite_quest_step", { step: "send" }),
      ev("a", "invite_shared", { via: "copy", source: "quest" }),
      ...["a", "b", "c"].map((u) => ev(u, "invite_help_answer", { answers: "shy,texts" }))
    ],
    referral_edges: [{ referrer_user_id: "a", referral_user_id: "x", claimed_at: at(2) }],
    referral_rewards: [
      { referrer_user_id: "a", referral_user_id: "x", kind: "signup", amount: 0.1, destination: "core", created_at: at(2) },
      { referrer_user_id: "a", referral_user_id: "x", kind: "active", amount: 0.55, destination: "core", created_at: at(1) }
    ],
    humanity_verifications: []
  }, { now: T });
  assert.equal(report.funnel[0].people, 6);
  assert.equal(report.funnel[2].people, 1);
  assert.equal(report.invitations.active, 1);
  assert.equal(report.help[0].people, 3);
  assert.ok(Math.abs(report.paid.core - 0.65) < 1e-9);
  assert.ok(report.proposals.some((proposal) => proposal.title.includes("отправки")), "few people reach sending");
  assert.ok(report.proposals.some((proposal) => proposal.title.startsWith("Чаще всего просят")), "top survey answer becomes a proposal");
}

// Quest feedback: low-rated quest becomes a proposal; doubt about the 30-year sum is flagged.
{
  const { buildQuestFeedbackReport } = await import("../lib/questFeedbackAnalytics.ts");
  const T = Date.parse("2026-10-26T12:00:00Z");
  const ev = (user, name, properties) => ({ user_id: user, event_name: name, occurred_at: new Date(T - 3600_000).toISOString(), properties });
  const report = buildQuestFeedbackReport({
    challenges: [{ id: "q1", title: { ru: "Сила Core" } }],
    product_events: [
      ...[2, 3, 2].map((rating, i) => ev(`u${i}`, "quest_rated", { challenge_id: "q1", rating, reasons: "unclear" })),
      ...["unreal", "unreal", "nonsense", "impressive", "small"].map((reaction, i) => ev(`u${i}`, "core_power_reaction", { reaction }))
    ]
  }, { now: T });
  assert.equal(report.ratings[0].quest, "Сила Core");
  assert.equal(report.ratings[0].low, 3);
  assert.ok(report.proposals.some((proposal) => proposal.title.includes("Сила Core")));
  assert.ok(report.proposals.some((proposal) => proposal.title.includes("30 лет")));
}

console.log("daily analytics contract ok");
