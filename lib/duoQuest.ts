// «A task for two» (migration 20261030150000, no imports, tested by node): a friend joins by link; for `days` days each
// marks one step a day; when both have `neededDays` days inside the window, the duo succeeded and each claims the reward.

export const DUO_LOGIC = "duo_week";
export const DUO_NOTE_MAX = 200;

export type DuoCheckin = { userId: string; day: string; note: string };
export type DuoRow = { startedOn: string | null; days: number; neededDays: number; inviterUserId: string; partnerUserId: string | null };
export type DuoProgress = {
  /** Days of the window, oldest first (empty before the friend joins). */
  window: string[];
  /** 0-based day of the window today; -1 before it starts, `days` once it is over. */
  dayIndex: number;
  mine: boolean[];
  theirs: boolean[];
  myCount: number;
  theirCount: number;
  markedToday: boolean;
  succeeded: boolean;
  over: boolean;
};

function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
}

export function duoWindow(startedOn: string | null, days: number): string[] {
  if (!startedOn) return [];
  return Array.from({ length: days }, (_, index) => addDays(startedOn, index));
}

export function duoProgress(duo: DuoRow, checkins: DuoCheckin[], viewerId: string, today: string): DuoProgress {
  const window = duoWindow(duo.startedOn, duo.days);
  const otherId = viewerId === duo.inviterUserId ? duo.partnerUserId : duo.inviterUserId;
  const marked = (userId: string | null) => window.map((day) => Boolean(userId) && checkins.some((item) => item.userId === userId && item.day === day));
  const mine = marked(viewerId);
  const theirs = marked(otherId);
  const myCount = mine.filter(Boolean).length;
  const theirCount = theirs.filter(Boolean).length;
  const dayIndex = window.length === 0 ? -1 : today < window[0] ? -1 : today > window[window.length - 1] ? duo.days : window.indexOf(today);
  const succeeded = window.length > 0 && myCount >= duo.neededDays && theirCount >= duo.neededDays;
  return {
    window,
    dayIndex,
    mine,
    theirs,
    myCount,
    theirCount,
    markedToday: dayIndex >= 0 && dayIndex < duo.days && mine[dayIndex],
    succeeded,
    over: !succeeded && dayIndex >= duo.days
  };
}

/** Whether the viewer may mark today: the window is running and today is not marked yet. */
export function canCheckIn(progress: DuoProgress, days: number): boolean {
  return progress.dayIndex >= 0 && progress.dayIndex < days && !progress.markedToday;
}

export function cleanDuoNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/\s+/g, " ").trim().slice(0, DUO_NOTE_MAX);
  return note.length >= 2 ? note : null;
}

export function cleanDuoCode(raw: unknown): string | null {
  return typeof raw === "string" && /^[a-z0-9]{6,16}$/.test(raw) ? raw : null;
}
