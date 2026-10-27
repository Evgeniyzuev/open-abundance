import assert from "node:assert/strict";
import { walletChallengeDone, walletChallengeProgress, walletChallengeRule, walletStats } from "../lib/stayStreak.ts";
import { challengeNeedsHumanity, getChallengeAccessReasons } from "../lib/challengeEligibility.ts";

const dep = (amount, at) => ({ operation_type: "crypto_deposit", direction: "credit", amount, created_at: at });
const wd = (amount, at) => ({ operation_type: "crypto_withdrawal", direction: "debit", amount, created_at: at });
const now = new Date("2026-10-20T12:00:00Z");

assert.deepEqual(walletChallengeRule("wallet_first_deposit"), { kind: "first_deposit" });
assert.deepEqual(walletChallengeRule("wallet_net_deposit_20"), { kind: "net_deposit", amount: 20 });
assert.deepEqual(walletChallengeRule("stay_streak_30"), { kind: "stay", days: 30 });
assert.equal(walletChallengeRule("stay_streak_0"), null);
assert.equal(walletChallengeRule("daily_goal_half_streak_3"), null);
assert.equal(walletChallengeRule(null), null);

let stats = walletStats([], now);
assert.deepEqual(stats, { streakDays: 0, netDeposit: 0, hasDeposit: false, hasWithdrawal: false }, "no deposit, nothing counted");
assert.equal(walletChallengeDone({ kind: "first_deposit" }, stats), false);
assert.equal(walletChallengeDone({ kind: "deposit_or_withdrawal" }, stats), false);

// «Вывод и пополнение»: any top-up or any withdrawal.
assert.deepEqual(walletChallengeRule("wallet_deposit_or_withdrawal"), { kind: "deposit_or_withdrawal" });
assert.equal(walletChallengeDone({ kind: "deposit_or_withdrawal" }, walletStats([wd(0.5, "2026-10-10T12:00:00Z")], now)), true, "a withdrawal alone is enough");
assert.equal(walletChallengeDone({ kind: "deposit_or_withdrawal" }, walletStats([dep(0.1, "2026-10-10T12:00:00Z")], now)), true, "a top-up alone is enough");

stats = walletStats([dep(15, "2026-10-10T12:00:00Z")], now);
assert.equal(walletChallengeDone({ kind: "first_deposit" }, stats), true);
assert.equal(walletChallengeDone({ kind: "net_deposit", amount: 20 }, stats), false);
assert.deepEqual(walletChallengeProgress({ kind: "net_deposit", amount: 20 }, stats), { current: 15, target: 20, unit: "usd" }, "the card shows the current value");
stats = walletStats([dep(15, "2026-10-10T12:00:00Z"), dep(10, "2026-10-11T12:00:00Z"), wd(4, "2026-10-12T12:00:00Z")], now);
assert.equal(stats.netDeposit, 21, "net deposit is deposits minus withdrawals");
assert.equal(walletChallengeDone({ kind: "net_deposit", amount: 20 }, stats), true);
assert.equal(walletStats([dep(5, "2026-10-10T00:00:00Z"), wd(9, "2026-10-11T00:00:00Z")], now).netDeposit, 0, "never negative");

// The streak counts from the latest of the first deposit, the last withdrawal and the previous step.
const base = [dep(50, "2026-09-01T00:00:00Z")];
assert.equal(walletStats(base, now).streakDays, 49);
assert.equal(walletStats([...base, wd(5, "2026-10-15T12:00:00Z")], now).streakDays, 5, "a withdrawal restarts it");
assert.equal(walletStats(base, now, new Date("2026-10-18T12:00:00Z")).streakDays, 2, "it starts at the previous step, not at the first deposit");
assert.equal(walletStats([...base, dep(10, "2026-10-19T00:00:00Z")], now).streakDays, 49, "a later deposit does not reset it");
assert.equal(walletChallengeDone({ kind: "stay", days: 7 }, walletStats(base, now, new Date("2026-10-18T12:00:00Z"))), false);
assert.equal(walletChallengeDone({ kind: "stay", days: 7 }, walletStats(base, now, new Date("2026-10-10T12:00:00Z"))), true);
assert.equal(walletStats([dep(0, "2026-09-01T00:00:00Z")], now).hasDeposit, false, "zero amounts are ignored");

// Humanity gate for accepting rewarded challenges.
const paid = { category: "finance", core_reward_amount: 1.2, wallet_reward_amount: 0, difficulty_level: 1 };
assert.equal(challengeNeedsHumanity(paid), true);
assert.equal(challengeNeedsHumanity({ ...paid, category: "onboarding" }), false);
assert.equal(challengeNeedsHumanity({ ...paid, category: "start_path" }), false);
assert.equal(challengeNeedsHumanity({ ...paid, verification_logic: "humanity_confirmed" }), false);
assert.equal(challengeNeedsHumanity({ ...paid, core_reward_amount: 1 }), false, "$1 and less is open to everyone");
assert.equal(challengeNeedsHumanity({ ...paid, core_reward_amount: 0.6, wallet_reward_amount: 0.6 }), true, "core and wallet rewards add up");
assert.deepEqual(getChallengeAccessReasons({ ...paid, humanity_confirmed: false }, 1), ["humanity"]);
assert.deepEqual(getChallengeAccessReasons({ ...paid, humanity_confirmed: true }, 1), []);
assert.deepEqual(getChallengeAccessReasons(paid, 1), [], "unknown humanity never blocks");
console.log("stay streak contract passed");
