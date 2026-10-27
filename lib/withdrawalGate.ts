/** Founder rule (2026-10-27): without «I'm not a robot» the first withdrawal is at least $1; after that, no limit. */
export const FIRST_WITHDRAWAL_MIN_USD_WITHOUT_HUMANITY = 1;

/** An error message when this withdrawal is blocked by the rule, otherwise null. Never blocks on a lookup failure. */
export async function firstWithdrawalBlock(db: any, userId: string, payoutUsd: number): Promise<string | null> {
  if (!Number.isFinite(payoutUsd) || payoutUsd >= FIRST_WITHDRAWAL_MIN_USD_WITHOUT_HUMANITY) return null;
  const [humanity, previous] = await Promise.all([
    db.from("humanity_verifications").select("humanity_level").eq("user_id", userId).maybeSingle(),
    db.from("wallet_ledger").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("operation_type", "crypto_withdrawal").eq("direction", "debit")
  ]);
  if (humanity.error || previous.error) return null;
  if (Number(humanity.data?.humanity_level ?? 0) >= 2) return null;
  if (Number(previous.count ?? 0) > 0) return null;
  return `The first withdrawal without «I'm not a robot» starts at $${FIRST_WITHDRAWAL_MIN_USD_WITHOUT_HUMANITY}. Pass «I'm not a robot» in Quests or withdraw at least $${FIRST_WITHDRAWAL_MIN_USD_WITHOUT_HUMANITY}.`;
}
