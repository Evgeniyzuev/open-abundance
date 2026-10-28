// "Price of your word" (Evgen, 2026-10-28): the person promises to finish one of their accepted quests by a deadline
// and puts a small deposit from the Wallet on it. Quest completed in time: the deposit comes back and 10% of it is added
// to Core. Not in time: the deposit stays in the Open Abundance reward fund that pays these bonuses. Completion is the
// quest's own verification, never self-report. Settlement and limits live in migration 20261028090000. Pure.

export const PLEDGE_AMOUNTS = [1, 3, 5, 10] as const;
export const PLEDGE_MIN = 1;
export const PLEDGE_MAX = 20;
/** Bonus share of the deposit, fixed in the database function; kept here for the texts. */
export const PLEDGE_BONUS_PERCENT = 10;
const DAY_MS = 86_400_000;
const MIN_LEAD_MS = 12 * 3_600_000;

export type PledgeStatus = "active" | "kept" | "missed";

export function pledgeBonus(amount: number): number {
  return Math.round(amount * PLEDGE_BONUS_PERCENT) / 100;
}

/** Deposit choices the person can afford right now. */
export function affordableAmounts(walletBalance: number): number[] {
  return PLEDGE_AMOUNTS.filter((amount) => amount <= walletBalance);
}

/**
 * The deadline: the end (23:59 UTC) of the next meeting day, so the promise is checked at the next meeting.
 * Without meetings, three days ahead. Always at least 12 hours ahead, as the database requires.
 */
export function pledgeDeadline(nextMeetingDay: string | null, now: number): string {
  const base = nextMeetingDay ? Date.parse(`${nextMeetingDay}T23:59:00Z`) : now + 3 * DAY_MS;
  const at = Number.isFinite(base) && base - now >= MIN_LEAD_MS ? base : now + DAY_MS;
  return new Date(at).toISOString();
}
