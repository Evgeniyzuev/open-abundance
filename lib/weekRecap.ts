// Pure weekly recap from on-device data (no imports, tested directly by node).
// Only counts are produced: no task titles or note text, so the recap is safe to share.

export type RecapTask = { id: string; completed: boolean; deleted?: boolean; updatedAt: string };
export type RecapCompletion = { taskId: string; localDate: string; type: "done" | "life" };
export type RecapNote = { createdAt: string; deleted?: boolean; morning?: boolean; contexts?: string[] };

export type WeekRecap = {
  /** Seven local day keys, oldest first, ending today. */
  days: string[];
  /** Done check-offs per day (lives are not counted as work). */
  perDay: number[];
  activeDays: number;
  checkIns: number;
  tasksFinished: number;
  notesWritten: number;
  /** Morning check-ins written in the week. */
  mornings: number;
  /** Distinct life contexts the person tagged in the week (a count only, never the labels). */
  contexts: number;
  /** Longest run of consecutive active days inside the week. */
  bestRun: number;
};

export function lastSevenDays(today: string): string[] {
  const [year, month, day] = today.split("-").map(Number);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(year, month - 1, day - 6 + index);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
  });
}

function localDayOf(iso: string): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function computeWeekRecap(input: { today: string; tasks: RecapTask[]; completions: RecapCompletion[]; notes: RecapNote[] }): WeekRecap {
  const days = lastSevenDays(input.today);
  const inWeek = new Set(days);
  const perDay = days.map((day) => input.completions.filter((completion) => completion.localDate === day && completion.type === "done").length);

  let bestRun = 0;
  let run = 0;
  for (const count of perDay) {
    run = count > 0 ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }

  const tasksFinished = input.tasks.filter((task) => {
    const day = task.completed && !task.deleted ? localDayOf(task.updatedAt) : null;
    return day !== null && inWeek.has(day);
  }).length;
  const notesWritten = input.notes.filter((note) => {
    const day = note.deleted ? null : localDayOf(note.createdAt);
    return day !== null && inWeek.has(day);
  }).length;

  const weekNotes = input.notes.filter((note) => {
    const day = note.deleted ? null : localDayOf(note.createdAt);
    return day !== null && inWeek.has(day);
  });
  const mornings = weekNotes.filter((note) => note.morning === true).length;
  const contexts = new Set(weekNotes.flatMap((note) => (Array.isArray(note.contexts) ? note.contexts : []))).size;

  return {
    days,
    perDay,
    activeDays: perDay.filter((count) => count > 0).length,
    checkIns: perDay.reduce((sum, count) => sum + count, 0),
    tasksFinished,
    notesWritten,
    mornings,
    contexts,
    bestRun
  };
}

export type OverdueCandidate = { id: string; completed: boolean; deleted?: boolean; schedule: { type: string; date?: string } };

/** One-time tasks whose date has passed without being done, oldest first: the "loose ends" of the week. */
export function findOverdueTasks<T extends OverdueCandidate>(tasks: T[], today: string): T[] {
  return tasks
    .filter((task) => !task.completed && !task.deleted && task.schedule.type === "once" && typeof task.schedule.date === "string" && task.schedule.date < today)
    .sort((left, right) => String(left.schedule.date).localeCompare(String(right.schedule.date)));
}

export function hasWeekActivity(recap: WeekRecap): boolean {
  return recap.checkIns + recap.tasksFinished + recap.notesWritten > 0;
}

/** Key of the week the prompt belongs to, so a dismissal lasts until next week. */
export function recapWeekKey(today: string): string {
  return lastSevenDays(today)[0];
}

/** The Home prompt appears only on Sunday and Monday (ISO weekday 7 and 1). */
export function isRecapPromptDay(today: string): boolean {
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 1;
}

export const RETURN_AFTER_DAYS = 3;

/** Whole local days between the last Home visit and today, or null on the first visit on this device. */
export function daysSinceVisit(lastVisitDay: string | null, today: string): number | null {
  if (!lastVisitDay || !/^\d{4}-\d{2}-\d{2}$/.test(lastVisitDay)) return null;
  const [y1, m1, d1] = lastVisitDay.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Which quiet Home line to show: the weekly recap on Sunday/Monday, or — after a break of three
 * days or more — a welcome back that offers to sort out loose ends. Never both, never pushy.
 */
export function pickRecapPrompt(input: { today: string; hasActivity: boolean; overdueCount: number; daysSinceVisit: number | null }): "weekly" | "return" | null {
  if (input.daysSinceVisit !== null && input.daysSinceVisit >= RETURN_AFTER_DAYS && input.overdueCount > 0) return "return";
  if (isRecapPromptDay(input.today) && (input.hasActivity || input.overdueCount > 0)) return "weekly";
  return null;
}
