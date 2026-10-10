import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/wallet/transfer/route.ts", "utf8");
const wallet = readFileSync("components/WalletApp.tsx", "utf8");

// A transfer receipt may show the sender's own balance only; the recipient's balance is private.
const recipientType = route.match(/recipient: \{[^}]*\};/)?.[0] ?? "";
assert.ok(recipientType.length > 0, "transfer response declares a recipient block");
assert.doesNotMatch(recipientType, /balance/i, "the recipient block must not carry a balance");
assert.doesNotMatch(route, /recipientLedger/, "the recipient's ledger balance must not be read for the response");
assert.doesNotMatch(wallet, /receipt\.recipient\.balanceAfter/, "the receipt must not show the recipient's balance");
assert.doesNotMatch(wallet, /receiptBalances/, "the two-balance receipt text is gone");

console.log("transfer privacy contract ok");
