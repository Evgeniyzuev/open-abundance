// Pure weekly recap from on-device data (no imports, tested directly by node).
// Only counts are produced: no task titles or note text, so the recap is safe to share.

export type RecapTask = { id: string; completed: boolean; deleted?: boolean; updatedAt: string };
export type RecapCompletion = { taskId: string; localDate: string; type: "done" | "life" };
export type RecapNote = { createdAt: string; deleted?: boolean };

export type WeekRecap = {
  /** Seven local day keys, oldest first, ending today. */
  days: string[];
  /** Done check-offs per day (lives are not counted as work). */
  perDay: number[];
  activeDays: number;
  checkIns: number;
  tasksFinished: number;
  notesWritten: number;
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

  return {
    days,
    perDay,
    activeDays: perDay.filter((count) => count > 0).length,
    checkIns: perDay.reduce((sum, count) => sum + count, 0),
    tasksFinished,
    notesWritten,
    bestRun
  };
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
