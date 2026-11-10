// "Wishes of the week" (Evgen, 2026-11-10): every week Open Abundance helps fulfil several wishes of active
// participants. A wish takes part when the person has an active wish and made at least one step this week
// (a completed quest). The choice itself is made by the operator from the daily fulfilment candidates; this
// module only says who takes part and what is left to do, so the Home card can show one clear next action.
const DAY_MS = 86_400_000;

export type WeeklyWishState = {
  weekStart: string;
  weekEnd: string;
  daysLeft: number;
  hasWish: boolean;
  stepsThisWeek: number;
  participating: boolean;
  next: "add_wish" | "make_step" | "keep_going";
  fulfilledTotal: number;
};

/** Monday 00:00 UTC of the week that contains `now`, as a timestamp. */
export function weekStartMs(now: number): number {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS;
}

export function buildWeeklyWishState(input: { now: number; activeWishes: number; stepsThisWeek: number; fulfilledTotal: number }): WeeklyWishState {
  const start = weekStartMs(input.now);
  const end = start + 7 * DAY_MS;
  const hasWish = input.activeWishes > 0;
  const stepsThisWeek = Math.max(0, Math.floor(input.stepsThisWeek));
  const participating = hasWish && stepsThisWeek > 0;
  return {
    weekStart: new Date(start).toISOString().slice(0, 10),
    weekEnd: new Date(end - DAY_MS).toISOString().slice(0, 10),
    daysLeft: Math.max(1, Math.ceil((end - input.now) / DAY_MS)),
    hasWish,
    stepsThisWeek,
    participating,
    next: !hasWish ? "add_wish" : stepsThisWeek === 0 ? "make_step" : "keep_going",
    fulfilledTotal: Math.max(0, Math.floor(input.fulfilledTotal))
  };
}
