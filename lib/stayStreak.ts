// Rules of the "no withdrawals" streak challenges (no imports, tested directly by node).
// A day counts when there was no crypto withdrawal; deposits start the streak, Wallet spending and Core top-ups never break it.

/** Net deposits (deposits minus withdrawals) needed before the challenges can be completed; never shown as a number to the user. */
export const STAY_MIN_NET_DEPOSIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StayLedgerRow = { operation_type: string; direction: string; amount: number | string; created_at: string };

/** The streak length N of a "stay_streak_N" check, or null for any other check. */
export function stayStreakDays(logic: string | null | undefined): number | null {
  const match = logic?.match(/^stay_streak_(\d+)$/);
  const days = match ? Number(match[1]) : 0;
  return days > 0 ? days : null;
}

export function stayStreakStats(rows: StayLedgerRow[], now: Date): { streakDays: number; netDeposit: number } {
  let deposits = 0;
  let withdrawals = 0;
  let firstDeposit = Infinity;
  let lastWithdrawal = -Infinity;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const time = Date.parse(row.created_at);
    if (!Number.isFinite(time) || amount <= 0) continue;
    if (row.operation_type === "crypto_deposit" && row.direction === "credit") {
      deposits += amount;
      firstDeposit = Math.min(firstDeposit, time);
    } else if (row.operation_type === "crypto_withdrawal" && row.direction === "debit") {
      withdrawals += amount;
      lastWithdrawal = Math.max(lastWithdrawal, time);
    }
  }
  if (firstDeposit === Infinity) return { streakDays: 0, netDeposit: 0 };
  const start = Math.max(firstDeposit, lastWithdrawal);
  return { streakDays: Math.max(0, Math.floor((now.getTime() - start) / DAY_MS)), netDeposit: deposits - withdrawals };
}
