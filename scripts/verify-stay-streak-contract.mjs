import assert from "node:assert/strict";
import { STAY_MIN_NET_DEPOSIT, stayStreakDays, stayStreakStats } from "../lib/stayStreak.ts";

const dep = (amount, at) => ({ operation_type: "crypto_deposit", direction: "credit", amount, created_at: at });
const wd = (amount, at) => ({ operation_type: "crypto_withdrawal", direction: "debit", amount, created_at: at });
const now = new Date("2026-10-20T12:00:00Z");

assert.equal(stayStreakDays("stay_streak_30"), 30);
assert.equal(stayStreakDays("stay_streak_0"), null);
assert.equal(stayStreakDays("daily_goal_half_streak_3"), null);
assert.equal(stayStreakDays(null), null);

assert.deepEqual(stayStreakStats([], now), { streakDays: 0, netDeposit: 0 }, "no deposit, no streak");
let stats = stayStreakStats([dep(50, "2026-10-10T12:00:00Z")], now);
assert.equal(stats.streakDays, 10, "streak starts at the first deposit");
assert.equal(stats.netDeposit, 50);
stats = stayStreakStats([dep(50, "2026-09-01T00:00:00Z"), wd(5, "2026-10-15T12:00:00Z")], now);
assert.equal(stats.streakDays, 5, "a withdrawal restarts the streak");
assert.equal(stats.netDeposit, 45);
stats = stayStreakStats([dep(50, "2026-09-01T00:00:00Z"), wd(5, "2026-10-01T00:00:00Z"), dep(10, "2026-10-18T00:00:00Z")], now);
assert.equal(stats.streakDays, 19, "a later deposit does not reset it");
assert.equal(stayStreakStats([dep(0, "2026-09-01T00:00:00Z")], now).streakDays, 0, "zero amounts are ignored");
assert.ok(STAY_MIN_NET_DEPOSIT > 0);
console.log("stay streak contract passed");
