// "Price of your word" (Evgen, 2026-10-28): the person promises to finish one of their accepted quests by a deadline
// and puts a small deposit from the Wallet on it. Quest completed in time: the deposit comes back and a bonus is added
// to Core: up to 10% × the quest's share (value for Open Abundance's growth × difficulty × length, migration
// 20261028120000), paid from the pool of missed deposits, at least 2% × share. Onboarding steps take no word, the
// deposit is capped at 10 × the quest's reward ($1–20), and each quest takes a word only once. Not in time: the deposit stays in the Open Abundance reward fund that pays these bonuses. Completion is the
// quest's own verification, never self-report. Settlement and limits live in migration 20261028090000. Pure.

export const PLEDGE_AMOUNTS = [1, 3, 5, 10, 20] as const;
export const PLEDGE_MIN = 1;
export const PLEDGE_MAX = 20;
/** The highest bonus share of the deposit; the real one per quest comes from the database. */
export const PLEDGE_BONUS_MAX_PERCENT = 10;
const DAY_MS = 86_400_000;
const MIN_LEAD_MS = 12 * 3_600_000;

export type PledgeStatus = "active" | "kept" | "missed";

export function pledgeBonus(amount: number, percent: number): number {
  return Math.round(amount * percent) / 100;
}

/** Deposit choices the person can afford right now, within the quest's cap when given. */
export function affordableAmounts(walletBalance: number, questCap: number = PLEDGE_MAX): number[] {
  return PLEDGE_AMOUNTS.filter((amount) => amount <= walletBalance && amount <= questCap);
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
