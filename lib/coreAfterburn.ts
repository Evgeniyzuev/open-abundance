// Afterburn helpers shared by the route, the panel and the contract test (no imports).
// The move itself happens only in the night job (public.run_daily_afterburn).

/** Minimum the night job moves; smaller remainders stay in Wallet. */
export const AFTERBURN_MIN_MOVE = 0.01;
export const AFTERBURN_MAX_KEEP = 1_000_000_000;

/** Kept Wallet amount from user input, in cents; null when it is not a number of 0 or more. */
export function normalizeAfterburnKeepAmount(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.replace(",", ".").trim() || "0") : typeof value === "number" ? value : value == null ? 0 : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > AFTERBURN_MAX_KEEP) return null;
  return Math.round(number * 100) / 100;
}

/** What tonight's move would be for the current Wallet balance (the same rounding as the night job). */
export function afterburnPreview(walletBalance: number, keepAmount: number): number {
  const free = Math.floor((Math.max(0, walletBalance) - Math.max(0, keepAmount)) * 100 + 1e-9) / 100;
  return free >= AFTERBURN_MIN_MOVE ? free : 0;
}
