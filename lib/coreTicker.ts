// Pure maths of the live Core income counter (no imports, tested directly by node).
// It only visualises the existing daily accrual: balance x daily rate, paid at 00:00 UTC.
// Nothing here changes a balance or a rate.

export const TICKER_DAILY_RATE = 0.000633;
export const SECONDS_PER_DAY = 86_400;

export type CoreTickerState = {
  /** Gross income per second at the current balance. */
  perSecond: number;
  /** Gross income of the whole UTC day. */
  perDay: number;
  /** Share of today's income that has built up since 00:00 UTC. */
  today: number;
  /** Part of `today` that goes back into Core and part that goes to Wallet, by the reinvest percent. */
  todayToCore: number;
  todayToWallet: number;
  /** Fraction of the UTC day that has passed (0..1). */
  dayProgress: number;
  /** Decimals needed for the last digit to move about every tenth of a second. */
  decimals: number;
};

export function secondsSinceUtcMidnight(now: Date): number {
  return now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds() + now.getUTCMilliseconds() / 1000;
}

/** Decimals so that one tick (a tenth of a second) changes the last shown digit; between 2 and 12. */
export function tickerDecimals(perSecond: number): number {
  if (!Number.isFinite(perSecond) || perSecond <= 0) return 2;
  const perTick = perSecond / 10;
  return Math.min(12, Math.max(2, Math.ceil(-Math.log10(perTick)) + 1));
}

export function computeCoreTicker(input: { balance: number; reinvestPercent: number; now: Date }): CoreTickerState {
  const balance = Number.isFinite(input.balance) ? Math.max(0, input.balance) : 0;
  const reinvest = Number.isFinite(input.reinvestPercent) ? Math.min(100, Math.max(0, input.reinvestPercent)) : 0;
  const perDay = balance * TICKER_DAILY_RATE;
  const perSecond = perDay / SECONDS_PER_DAY;
  const dayProgress = Math.min(1, secondsSinceUtcMidnight(input.now) / SECONDS_PER_DAY);
  const today = perDay * dayProgress;
  const todayToCore = today * (reinvest / 100);
  return {
    perSecond,
    perDay,
    today,
    todayToCore,
    todayToWallet: today - todayToCore,
    dayProgress,
    decimals: tickerDecimals(perSecond)
  };
}

/** Growth factor of Core after `years` with full reinvestment at the current daily rate (a scenario, not a promise). */
export function coreGrowthFactor(years: number): number {
  return Math.pow(1 + TICKER_DAILY_RATE, 365 * Math.max(0, years));
}
