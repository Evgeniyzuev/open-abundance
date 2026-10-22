import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEconomyReport, flagSales, windowReport } from "../lib/economyReport.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-22T12:00:00Z");
const hoursAgo = (hours) => new Date(NOW - hours * 3600_000).toISOString();

const challenges = [
  { id: "c-ref", title: "Реферал", logic: "referral_program" },
  { id: "c-sale", title: "Первая продажа", logic: "first_sale" },
  { id: "c-day", title: "День", logic: "today_core_target_reached" }
];
const input = {
  challenges,
  completions: [
    { userId: "a", challengeId: "c-ref", core: 0, wallet: 2, at: hoursAgo(3) },
    { userId: "a", challengeId: "c-day", core: 1, wallet: 0, at: hoursAgo(2) },
    { userId: "b", challengeId: "c-day", core: 10, wallet: 0, at: hoursAgo(5) },
    { userId: "c", challengeId: "c-sale", core: 1, wallet: 0, at: hoursAgo(80) },
    { userId: "x", challengeId: "c-day", core: 1, wallet: 0, at: hoursAgo(24 * 9) }
  ],
  registrations: [hoursAgo(1), hoursAgo(30), hoursAgo(24 * 20)],
  referrals: [{ referrerId: "a", referralId: "n1", at: hoursAgo(1) }, { referrerId: "a", referralId: "n2", at: hoursAgo(50) }],
  activity: [{ userId: "a", at: hoursAgo(1) }, { userId: "b", at: hoursAgo(4) }, { userId: "d", at: hoursAgo(6) }, { userId: "c", at: hoursAgo(90) }],
  deals: []
};

// One day: only the rewards of the last 24 hours, the cost of attraction and who earned how much.
const day = windowReport(input, 1, NOW);
assert.equal(day.rewardsCore, 11);
assert.equal(day.rewardsWallet, 2);
assert.equal(day.rewardsTotal, 13);
assert.equal(day.completions, 3);
assert.equal(day.activeUsers, 3, "a, b and d opened the app in the last day");
assert.equal(day.newUsers, 1);
assert.equal(day.newReferred, 1);
assert.equal(day.attractionRewards, 2);
assert.equal(day.costPerReferred, 2, "$2 of attraction rewards for one invited person");
assert.equal(day.rewardPerActiveUser, 4.33);
assert.equal(day.earnedAtLeast1, 0.667, "a (3) and b (10) of three active people earned $1 or more");
assert.equal(day.earnedAtLeast10, 0.333, "only b reached $10");
assert.deepEqual(day.top[0], { title: "День", count: 2, total: 11 });

// One week includes the older sale, but not the reward from nine days ago.
const week = windowReport(input, 7, NOW);
assert.equal(week.completions, 4);
assert.equal(week.newReferred, 2);
assert.equal(week.costPerReferred, 1);

// Empty windows give null instead of dividing by zero.
const empty = windowReport({ ...input, completions: [], referrals: [], registrations: [], activity: [] }, 1, NOW);
assert.equal(empty.costPerReferred, null);
assert.equal(empty.rewardPerNewUser, null);
assert.equal(empty.rewardPerActiveUser, null);
assert.equal(empty.earnedAtLeast10, null);

// Sales: the same pair three times, two people selling to each other, a seller and buyer joined by an invitation, and ordinary trade.
const deal = (sellerId, buyerId, price = 5) => ({ sellerId, buyerId, price, at: hoursAgo(10) });
const flags = flagSales(
  [deal("s1", "b1"), deal("s1", "b1"), deal("s1", "b1", 10), deal("p", "q"), deal("q", "p"), deal("inviter", "invited"), deal("seller", "buyer"), deal("seller", "other")],
  [{ referrerId: "inviter", referralId: "invited", at: "" }]
);
assert.deepEqual(flags.map((flag) => [flag.kind, flag.sellerId, flag.buyerId]), [["repeat_pair", "s1", "b1"], ["reciprocal", "p", "q"], ["reciprocal", "q", "p"], ["referral_link", "inviter", "invited"]].sort((a, b) => 0) , "ordinary trade is not flagged");
assert.equal(flags[0].total, 20);
assert.equal(flags[0].deals, 3);

// The whole report counts only the week's deals.
const report = buildEconomyReport({ ...input, deals: [deal("s1", "b1"), { ...deal("old", "older"), at: hoursAgo(24 * 10) }] }, NOW);
assert.equal(report.salesChecked, 1);
assert.equal(report.day.days, 1);
assert.equal(report.week.days, 7);

// Wiring: read only, closed to everyone but the operator and the cron, scheduled daily, shown in the operator console.
const route = read("app/api/internal/economy/daily/route.ts");
assert.ok(route.includes("isGrowthOperator(user.id)") && route.includes("CRON_SECRET") && !/\.(insert|update|upsert|delete)\(/.test(route), "the report route is read only and closed");
assert.ok(JSON.parse(read("vercel.json")).crons.some((cron) => cron.path === "/api/internal/economy/daily"), "the report is scheduled daily");
assert.ok(read("components/OperatorConsole.tsx").includes("/api/internal/economy/daily"), "the operator console shows the report");
console.log("Economy report contract verified.");
