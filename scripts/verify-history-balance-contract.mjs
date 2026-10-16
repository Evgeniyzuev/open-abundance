import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconstructBalances } from "../lib/historyBalance.ts";

// Newest first. Current balance 100. Row 0: +10 (exact 100). Row 1: -5 (no exact). Row 2: +20 (exact 95).
// Going back: after row 1 = 100 - 10 = 90, but row 2's exact value is 95 ... use consistent data below.
const consistent = reconstructBalances([
  { delta: 10, exactAfter: 100 },
  { delta: -5 },
  { delta: 20, exactAfter: 95 },
  { delta: 3 }
], 100);
// After row 0 = 100; before row 0 = 90 -> after row 1 = 90; before row 1 = 95 -> after row 2 = 95 (matches the exact 95).
assert.deepEqual(consistent, [100, 90, 95, 75], "a chain that agrees with the exact values is shown in full");

// A hidden operation: row 2 says 95 exactly, but the chain from above reaches 80: the rows between are unknown.
const broken = reconstructBalances([
  { delta: 10, exactAfter: 100 },
  { delta: -5 },
  { delta: 20, exactAfter: 80 }
], 100);
assert.deepEqual(broken, [100, null, 80], "rows that contradict an exact value show nothing");

// Without any exact value nothing confirms the chain.
assert.deepEqual(reconstructBalances([{ delta: 1 }, { delta: 2 }], 50), [null, null]);
assert.deepEqual(reconstructBalances([], 50), []);

// Unknown current balance: only rows with an exact value and what follows them can be shown.
assert.deepEqual(reconstructBalances([{ delta: 5 }, { delta: 5, exactAfter: 40 }], null), [null, 40]);

// Daily accrual rows (no ledger) between ledger rows are reconstructed from the ledger balances.
const wallet = reconstructBalances([
  { delta: -10, exactAfter: 190 },
  { delta: 0.63 },
  { delta: 200, exactAfter: 199.37 }
], 190);
assert.ok(Math.abs((wallet[1] ?? 0) - 200) < 1e-9 && wallet[0] === 190 && wallet[2] === 199.37, "an unrecorded payout gets its balance from the neighbours");

// Wiring: both history routes use the helper and the Wallet route no longer filters by a list of types.
const walletRoute = readFileSync(new URL("../app/api/wallet/history/route.ts", import.meta.url), "utf8");
const coreRoute = readFileSync(new URL("../app/api/core/history/route.ts", import.meta.url), "utf8");
assert.ok(walletRoute.includes("reconstructBalances") && coreRoute.includes("reconstructBalances"), "both routes reconstruct balances");
assert.ok(!/\.in\("operation_type"/.test(walletRoute), "no allow-list hides a type such as a shop purchase");
assert.ok(walletRoute.includes("system_shop_purchase"), "shop purchases are named");
console.log("History balance contract verified.");
