// Pure rules of the "growth" track (GROW-001): actions that grow Core and keep the reserve sufficient.
// The route reads the facts (Core top-ups from the Wallet ledger, completed internal purchases, spend intents)
// and these helpers decide. No imports, tested directly by node.

export const GROWTH_TOPUP_MONTHS_TARGET = 3;
export const SPEND_SHIFT_PURCHASES_TARGET = 3;
export const SPEND_SHIFT_WINDOW_DAYS = 60;

/** Number of distinct calendar months (UTC) among valid ISO timestamps. */
export function distinctMonths(timestamps: Array<string | null | undefined>): number {
  const months = new Set<string>();
  for (const value of timestamps) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    const date = new Date(time);
    months.add(`${date.getUTCFullYear()}-${date.getUTCMonth()}`);
  }
  return months.size;
}

/** How many timestamps fall inside the window that ends at `now` (inclusive). */
export function countWithinDays(timestamps: Array<string | null | undefined>, days: number, now: number): number {
  const from = now - days * 86_400_000;
  return timestamps.filter((value) => {
    if (!value) return false;
    const time = Date.parse(value);
    return !Number.isNaN(time) && time >= from && time <= now;
  }).length;
}

/** True when some top-up happened at or after the first wish that has a target amount (a top-up "for a wish"). */
export function topUpAfterWish(wishCreatedAts: Array<string | null | undefined>, topUpAts: Array<string | null | undefined>): boolean {
  const wishTimes = wishCreatedAts.map((v) => (v ? Date.parse(v) : NaN)).filter((t) => !Number.isNaN(t));
  if (wishTimes.length === 0) return false;
  const first = Math.min(...wishTimes);
  return topUpAts.some((v) => {
    const t = v ? Date.parse(v) : NaN;
    return !Number.isNaN(t) && t >= first;
  });
}
