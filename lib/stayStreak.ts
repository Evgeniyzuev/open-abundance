// Rules of the Wallet chain challenges (no imports, tested directly by node):
//   wallet_first_deposit   any deposit
//   wallet_deposit_or_withdrawal   any deposit or any withdrawal
//   wallet_first_withdrawal   any withdrawal («Первый вывод», path step)
//   wallet_topup_bonus     a top-up after the first withdrawal; pays 10% of it to Core, at most $5 (SQL settle_topup_bonus_challenge)
//   wallet_net_deposit_N   deposits minus withdrawals reach N dollars
//   stay_streak_N          N days without a crypto withdrawal, counted from the previous step of the chain
// Wallet spending inside the app and Core top-ups never break a streak.

const DAY_MS = 24 * 60 * 60 * 1000;

export type StayLedgerRow = { operation_type: string; direction: string; amount: number | string; created_at: string };
export const TOPUP_BONUS_LOGIC = "wallet_topup_bonus";
export const TOPUP_BONUS_PERCENT = 10;
export const TOPUP_BONUS_MAX_USD = 5;

export type WalletChallengeRule = { kind: "first_deposit" } | { kind: "first_withdrawal" } | { kind: "deposit_or_withdrawal" } | { kind: "net_deposit"; amount: number } | { kind: "stay"; days: number };
export type WalletChallengeProgress = { current: number; target: number; unit: "usd" | "days" };
export type WalletStats = { streakDays: number; netDeposit: number; hasDeposit: boolean; hasWithdrawal: boolean };

export function walletChallengeRule(logic: string | null | undefined): WalletChallengeRule | null {
  if (logic === "wallet_first_deposit") return { kind: "first_deposit" };
  if (logic === "wallet_deposit_or_withdrawal") return { kind: "deposit_or_withdrawal" };
  if (logic === "wallet_first_withdrawal") return { kind: "first_withdrawal" };
  const net = logic?.match(/^wallet_net_deposit_(\d+)$/);
  if (net && Number(net[1]) > 0) return { kind: "net_deposit", amount: Number(net[1]) };
  const stay = logic?.match(/^stay_streak_(\d+)$/);
  if (stay && Number(stay[1]) > 0) return { kind: "stay", days: Number(stay[1]) };
  return null;
}

/** `since` is when the previous step of the chain was completed: the streak never starts before it. */
export function walletStats(rows: StayLedgerRow[], now: Date, since?: Date | null): WalletStats {
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
  const hasWithdrawal = lastWithdrawal > -Infinity;
  if (firstDeposit === Infinity) return { streakDays: 0, netDeposit: 0, hasDeposit: false, hasWithdrawal };
  const start = Math.max(firstDeposit, lastWithdrawal, since ? since.getTime() : -Infinity);
  return { streakDays: Math.max(0, Math.floor((now.getTime() - start) / DAY_MS)), netDeposit: Math.max(0, deposits - withdrawals), hasDeposit: true, hasWithdrawal };
}

/** Current value for the challenge card; null when the rule has nothing to count. */
export function walletChallengeProgress(rule: WalletChallengeRule, stats: WalletStats): WalletChallengeProgress | null {
  if (rule.kind === "net_deposit") return { current: Math.min(stats.netDeposit, rule.amount), target: rule.amount, unit: "usd" };
  if (rule.kind === "stay") return { current: Math.min(stats.streakDays, rule.days), target: rule.days, unit: "days" };
  return null;
}

export function walletChallengeDone(rule: WalletChallengeRule, stats: WalletStats): boolean {
  if (rule.kind === "first_deposit") return stats.hasDeposit;
  if (rule.kind === "deposit_or_withdrawal") return stats.hasDeposit || stats.hasWithdrawal;
  if (rule.kind === "first_withdrawal") return stats.hasWithdrawal;
  if (rule.kind === "net_deposit") return stats.netDeposit >= rule.amount;
  return stats.hasDeposit && stats.streakDays >= rule.days;
}
