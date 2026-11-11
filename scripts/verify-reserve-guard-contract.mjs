import assert from "node:assert/strict";
import { decideReserveGuard, sumJournal } from "../lib/reserveGuard.ts";

const none = { ton: 0, usdt: 0, usdtTransfers: 0 };
// The Nov 8 case: 12 TON and 20 USDT left, nothing in the journal.
assert.deepEqual(decideReserveGuard({ ton: 12.4, usdt: 20 }, { ton: 0.1, usdt: 0 }, none), { unexplainedTon: 12, unexplainedUsdt: 19.5, alarm: true });
// A journalled TON withdrawal with its fee explains the drop.
assert.equal(decideReserveGuard({ ton: 10, usdt: 5 }, { ton: 7.95, usdt: 5 }, { ton: 2.05, usdt: 0, usdtTransfers: 0 }).alarm, false);
// A USDT withdrawal also spends some TON on gas.
assert.equal(decideReserveGuard({ ton: 10, usdt: 50 }, { ton: 9.9, usdt: 30 }, { ton: 0, usdt: 20, usdtTransfers: 1 }).alarm, false);
// A deposit (balance grows) and small fee noise are not alarms.
assert.equal(decideReserveGuard({ ton: 1, usdt: 1 }, { ton: 5, usdt: 9 }, none).alarm, false);
assert.equal(decideReserveGuard({ ton: 5, usdt: 9 }, { ton: 4.8, usdt: 8.8 }, none).alarm, false);
// A balance that could not be read, or the first check without a baseline, never alarms.
assert.equal(decideReserveGuard({ ton: 12, usdt: 20 }, { ton: null, usdt: null }, none).alarm, false);
assert.equal(decideReserveGuard({ ton: null, usdt: null }, { ton: 0, usdt: 0 }, none).alarm, false);
// More left than the journal explains.
assert.equal(decideReserveGuard({ ton: 10, usdt: 0 }, { ton: 4, usdt: 0 }, { ton: 2, usdt: 0, usdtTransfers: 0 }).unexplainedTon, 3.7);

const since = "2026-11-11T10:00:00Z";
const journal = sumJournal(
  [
    { status: "confirmed", amount_ton: "2", network_fee_reserve_ton: "0.05", created_at: "2026-11-11T10:30:00Z" },
    { status: "failed", amount_ton: "9", network_fee_reserve_ton: "0.05", created_at: "2026-11-11T10:31:00Z" },
    { status: "confirmed", amount_ton: "7", network_fee_reserve_ton: "0.05", created_at: "2026-11-10T01:00:00Z" },
    { status: "broadcast", amount_ton: "1", network_fee_reserve_ton: "0.05", created_at: "2026-11-11T08:00:00Z", broadcast_at: "2026-11-11T09:30:00Z" }
  ],
  [{ status: "manual_review", amount_usdt: "20", created_at: "2026-11-11T10:40:00Z" }, { status: "refunded", amount_usdt: "5", created_at: "2026-11-11T10:41:00Z" }],
  since
);
assert.equal(Math.round(journal.ton * 100) / 100, 3.1, "failed and old rows do not count; a late broadcast within the slack does");
assert.deepEqual([journal.usdt, journal.usdtTransfers], [20, 1]);
console.log("reserve guard contract ok");
