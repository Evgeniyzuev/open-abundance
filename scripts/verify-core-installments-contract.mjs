import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dailyRepayment, installmentLimit, previewBuy, reputationFactor } from "../lib/coreInstallments.ts";

// The limit is what Core income repays by itself: the plan's table (Core $1 000 → ~$114 at full reputation).
assert.equal(installmentLimit({ core: 1000, completedDeals: 10, open: 0, humanityConfirmed: true }), 113.94);
assert.equal(installmentLimit({ core: 1000, completedDeals: 0, open: 0, humanityConfirmed: true }), 56.97, "newcomers get half");
assert.equal(installmentLimit({ core: 1000, completedDeals: 10, open: 100, humanityConfirmed: true }), 13.94, "open installments use the limit");
assert.equal(installmentLimit({ core: 1000, completedDeals: 10, open: 500, humanityConfirmed: true }), 0);
assert.equal(installmentLimit({ core: 1000, completedDeals: 10, open: 0, humanityConfirmed: false }), 0, "only after «Я не робот»");
assert.equal(reputationFactor(5), 0.75);
assert.equal(reputationFactor(40), 1);

// Repayment in full within the horizon: limit ≤ daily repayment × 360 for any Core.
for (const core of [10, 100, 1000, 25000]) {
  const limit = installmentLimit({ core, completedDeals: 10, open: 0, humanityConfirmed: true });
  assert.ok(limit <= dailyRepayment(core) * 360 + 1e-9, `Core ${core} repays its limit within 360 days`);
}

// The buy button.
assert.deepEqual(previewBuy({ price: 5, wallet: 7, limit: 0, core: 0, humanityConfirmed: false }), { kind: "enough" });
assert.deepEqual(previewBuy({ price: 12, wallet: 8, limit: 56.97, core: 1000, humanityConfirmed: true }), { kind: "installment", payNow: 8, installment: 4, days: 13 });
assert.deepEqual(previewBuy({ price: 12, wallet: 8, limit: 3, core: 1000, humanityConfirmed: true }), { kind: "too_small", shortfall: 4, limit: 3 });
assert.deepEqual(previewBuy({ price: 12, wallet: -1, limit: 50, core: 1000, humanityConfirmed: false }), { kind: "humanity_required", shortfall: 12 });

// The migration keeps the guarantees the plan promises.
const sql = readFileSync(new URL("../supabase/migrations/20261120140000_core_installments.sql", import.meta.url), "utf8");
assert.match(sql, /0\.5 \+ 0\.5 \* least\(1, v_deals \/ 10\.0\)/, "reputation 0.5..1 in SQL as in TS");
assert.match(sql, /v_core \* daily_rate \* repay_share \* horizon_days/, "limit from Core income");
assert.match(sql, /deferrable initially deferred/, "escrow outcome settles at commit");
assert.match(sql, /'core_installment_holdback'/, "the seller does not get the installment part ahead");
assert.match(sql, /'core_installment_cancel'/, "a refund takes the shortfall back");
assert.match(sql, /round\(greatest\(coalesce\(p_distributable, 0\), 0\) \* 0\.5, 12\)/, "at most half of today's income");
assert.ok(!/update public\.core_accounts set balance = balance -/.test(sql), "Core never decreases");
console.log("core installments contract ok");
