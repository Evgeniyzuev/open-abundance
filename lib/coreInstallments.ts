// «Взять и купить» под доход Core (Evgen, 2026-11-20). Pure rules shared by the API, the Wallet line, the buy button
// and the contract test. The database (migration 20261120140000) is the source of truth; these numbers explain it.

export const DAILY_RATE = 0.000633;
export const REPAY_SHARE = 0.5;
export const HORIZON_DAYS = 360;

/** Reputation multiplier: 0.5 for a newcomer, 1 after ten completed deals. */
export function reputationFactor(completedDeals: number): number {
  return 0.5 + 0.5 * Math.min(1, Math.max(0, completedDeals) / 10);
}

/** What half of the Core income repays within the horizon, scaled by reputation, minus what is still open. */
export function installmentLimit(input: { core: number; completedDeals: number; open: number; humanityConfirmed: boolean }): number {
  if (!input.humanityConfirmed) return 0;
  const capacity = Math.max(0, input.core) * DAILY_RATE * REPAY_SHARE * HORIZON_DAYS;
  return Math.max(0, Math.floor((capacity * reputationFactor(input.completedDeals) - Math.max(0, input.open)) * 100 + 1e-6) / 100);
}

/** Daily repayment from Core income: half of what the person would receive today. */
export function dailyRepayment(core: number): number {
  return Math.max(0, core) * DAILY_RATE * REPAY_SHARE;
}

export type BuyPreview =
  | { kind: "enough" }
  | { kind: "installment"; payNow: number; installment: number; days: number }
  | { kind: "too_small"; shortfall: number; limit: number }
  | { kind: "humanity_required"; shortfall: number };

/** What the buy button offers: an ordinary purchase, «Взять и купить» with the split, or why not. */
export function previewBuy(input: { price: number; wallet: number; limit: number; core: number; humanityConfirmed: boolean }): BuyPreview {
  const wallet = Math.max(0, input.wallet);
  if (wallet >= input.price) return { kind: "enough" };
  const shortfall = Math.ceil((input.price - wallet) * 100) / 100;
  if (!input.humanityConfirmed) return { kind: "humanity_required", shortfall };
  if (shortfall > input.limit) return { kind: "too_small", shortfall, limit: input.limit };
  const perDay = dailyRepayment(input.core);
  return { kind: "installment", payNow: Math.round(wallet * 100) / 100, installment: shortfall, days: perDay > 0 ? Math.ceil(shortfall / perDay) : HORIZON_DAYS };
}
