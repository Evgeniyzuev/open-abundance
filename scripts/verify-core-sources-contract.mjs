import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeCoreSources } from "../lib/coreSources.ts";

const empty = { topup: 0, purchases: 0, income: 0, challenges: 0, reviews: 0, referrals: 0, team: 0 };

// Parts add up to the balance; shares are of the whole.
const s = summarizeCoreSources(100, { ...empty, topup: 50, income: 10, challenges: 30, referrals: 2 });
assert.deepEqual(s.parts.map((p) => [p.key, p.amount, p.percent]), [["topup", 50, 50], ["purchases", 0, 0], ["income", 10, 10], ["actions", 40, 40]]);
// Purchases (Garden items and the shop Core share) are their own part.
const pu = summarizeCoreSources(60, { ...empty, topup: 20, purchases: 30, income: 10 });
assert.deepEqual(pu.parts.map((p) => [p.key, p.amount]), [["topup", 20], ["purchases", 30], ["income", 10], ["actions", 0]]);

// What no source explains goes to "other rewards", inside actions.
assert.deepEqual(s.actions.map((p) => [p.key, p.amount]), [["challenges", 30], ["referrals", 2], ["other", 8]]);

// Less than a cent of difference is rounding, not a source.
const r = summarizeCoreSources(10.004, { ...empty, topup: 10 });
assert.equal(r.actions.length, 0);
assert.equal(r.parts[0].percent, 100);

// Sources above the balance (should not happen) never make negative parts.
const over = summarizeCoreSources(5, { ...empty, topup: 6 });
assert.equal(over.parts[3].amount, 0);
assert.equal(over.parts[0].percent, 100);

// Empty Core.
const none = summarizeCoreSources(0, empty);
assert.ok(none.parts.every((p) => p.amount === 0 && p.percent === 0));

// The route reads only, sums every page, and uses the same sources as the Core history.
const route = readFileSync(new URL("../app/api/core/sources/route.ts", import.meta.url), "utf8");
assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(route), "read only");
assert.match(route, /\.range\(from, from \+ PAGE - 1\)/);
for (const table of ["wallet_ledger", "daily_core_accruals", "user_challenges", "peer_review_answers", "referral_rewards", "team_core_growth_rewards"]) {
  assert.match(route, new RegExp(`"${table}"`));
}
assert.match(route, /"wallet_core_topup"/);
assert.match(route, /"system_shop_purchase"/);

console.log("core sources contract ok");
