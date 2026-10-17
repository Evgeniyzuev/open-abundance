// Pure balance reconstruction for the Wallet and Core history lists (no imports, tested directly by node).
//
// Some operations record the exact balance after them (Wallet ledger rows, daily accruals of Core), the
// others do not. Going from the newest row to the oldest, the balance after a row is the balance after
// the newer row minus that newer row's change. An exact value is the truth: when the chain disagrees with
// it, the rows between the previous exact value and this one are not trustworthy (an operation that is
// not in the list changed the balance), so they show no balance rather than a wrong one.

export type BalanceRow = {
  /** Signed change of the balance: positive for credits, negative for debits. */
  delta: number;
  /** Exact balance right after this row, when the source stores it. */
  exactAfter?: number | null;
};

const EPSILON = 1e-6;

/** `rows` are newest first; the result has the balance after every row, or null when it cannot be trusted. */
export function reconstructBalances(rows: BalanceRow[], currentBalance: number | null): Array<number | null> {
  const result: Array<number | null> = new Array(rows.length).fill(null);
  let running = typeof currentBalance === "number" && Number.isFinite(currentBalance) ? currentBalance : null;
  let segmentStart = 0;
  let anchored = false;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const exact = typeof row.exactAfter === "number" && Number.isFinite(row.exactAfter) ? row.exactAfter : null;

    if (exact !== null) {
      if (running === null || Math.abs(running - exact) > EPSILON) {
        // The chain from above does not reach this exact value: the rows since the last anchor are unknown.
        for (let back = segmentStart; back < index; back += 1) result[back] = null;
      }
      result[index] = exact;
      running = exact;
      segmentStart = index + 1;
      anchored = true;
    } else {
      result[index] = running;
    }

    if (running !== null) running = running - (Number.isFinite(row.delta) ? row.delta : 0);
  }

  // Without a single exact value in the window nothing confirms the chain, so none of it is shown.
  if (!anchored) return result.map(() => null);
  // Rows older than the last exact value rest on that value alone; they stay as computed.
  return result;
}
