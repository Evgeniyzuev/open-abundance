// Wish price -> level: the Core level at which a wish can be paid from Core income without hurting growth.
// Rule (Evgen, 2026-10-27): about one year of income may go to one significant goal, one month of income
// to a medium goal. Example: Core $1000 gives ~$231 a year and ~$19 a month. A wish without a price
// (help from people, a habit) has level 0 and is open at once. Standalone (no imports) so the daily
// analytics script can import it with a relative path.

/** Same rate as lib/coreCalculator.ts. */
export const WISH_DAILY_CORE_RATE = 0.000633;

export type WishSize = "free" | "small" | "medium" | "significant";

/** Days of Core income a wish of each size may take. */
export const WISH_SIZE_DAYS: Record<Exclude<WishSize, "free">, number> = {
  small: 7,
  medium: 30,
  significant: 365
};

/** Core required for levels 1..40, as in the level_thresholds table. */
export const CORE_LEVEL_THRESHOLDS: number[] = (() => {
  const values: number[] = [];
  for (let level = 1; level <= 40; level += 1) {
    const step = (level - 1) % 10;
    const decade = Math.floor((level - 1) / 10);
    const base = 1000 ** decade;
    // 2, 4, 8, 16, 32, 64, 128, 250, 500, 1000 and the same pattern times 1000 per decade.
    const pattern = [2, 4, 8, 16, 32, 64, 128, 250, 500, 1000][step];
    values.push(pattern * base);
  }
  return values;
})();

export function coreForLevel(level: number): number {
  if (level <= 0) return 0;
  return CORE_LEVEL_THRESHOLDS[Math.min(level, CORE_LEVEL_THRESHOLDS.length) - 1];
}

export function levelForCore(core: number): number {
  let level = 0;
  for (let index = 0; index < CORE_LEVEL_THRESHOLDS.length; index += 1) {
    if (core >= CORE_LEVEL_THRESHOLDS[index]) level = index + 1;
  }
  return level;
}

/** Core income over a number of days, without reinvestment. */
export function coreIncome(core: number, days: number): number {
  return Math.max(0, core) * WISH_DAILY_CORE_RATE * days;
}

/** Core whose yearly income covers the price (the "significant goal" rule). */
export function coreNeededForPrice(price: number | null | undefined, days = WISH_SIZE_DAYS.significant): number {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / (WISH_DAILY_CORE_RATE * days);
}

/** Lowest Core level whose threshold yields a year of income at least the price; 0 for free wishes. */
export function wishLevelForPrice(price: number | null | undefined): number {
  const needed = coreNeededForPrice(price);
  if (needed <= 0) return 0;
  for (let index = 0; index < CORE_LEVEL_THRESHOLDS.length; index += 1) {
    if (CORE_LEVEL_THRESHOLDS[index] >= needed) return index + 1;
  }
  return CORE_LEVEL_THRESHOLDS.length;
}

/** How big the wish is for this Core balance: which income period covers it. */
export function wishSizeFor(price: number | null | undefined, core: number): WishSize | "later" {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return "free";
  if (coreIncome(core, WISH_SIZE_DAYS.small) >= value) return "small";
  if (coreIncome(core, WISH_SIZE_DAYS.medium) >= value) return "medium";
  if (coreIncome(core, WISH_SIZE_DAYS.significant) >= value) return "significant";
  return "later";
}

export type WishPriceSummary = {
  level: number;
  coreNeeded: number;
  size: WishSize | "later";
  yearIncome: number;
  monthIncome: number;
};

export function summarizeWishPrice(price: number | null | undefined, core: number): WishPriceSummary {
  return {
    level: wishLevelForPrice(price),
    coreNeeded: coreNeededForPrice(price),
    size: wishSizeFor(price, core),
    yearIncome: coreIncome(core, WISH_SIZE_DAYS.significant),
    monthIncome: coreIncome(core, WISH_SIZE_DAYS.medium)
  };
}
