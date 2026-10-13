import type { TaskCompletion, TaskItem } from "@/lib/tasksStore";

export function todayKey(): string {
  return toDateKey(new Date());
}

export function toDateKey(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function parseDateKey(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function getNextStep(task: TaskItem): string | null {
  if (task.subtasks.length === 0) return null;
  const done = new Set(task.doneSubtasks ?? []);
  const index = task.subtasks.findIndex((_, position) => !done.has(position));
  return index === -1 ? null : task.subtasks[index];
}

export function isDueOn(task: TaskItem, day: string): boolean {
  if (task.completed) return false;
  return isPlannedOn(task, day);
}

export function isPlannedOn(task: TaskItem, day: string): boolean {
  if (task.schedule.type === "once") return task.schedule.date === day;
  if (task.schedule.startDate > day) return false;
  if (task.schedule.type === "daily") {
    if (task.schedule.infinite || !task.schedule.targetDays) return true;
    if (task.streak?.softMode) return true;
    return daysBetween(task.schedule.startDate, day) < task.schedule.targetDays;
  }

  if (!task.schedule.weekdays.includes(getIsoWeekday(day))) return false;
  if (task.schedule.infinite || !task.schedule.targetDays) return true;
  if (task.streak?.softMode) return true;
  return countPlannedDaysThrough(task, day) <= task.schedule.targetDays;
}

export function getIsoWeekday(day: string): number {
  const value = parseDateKey(day).getDay();
  return value === 0 ? 7 : value;
}

export function daysBetween(from: string, to: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / dayMs);
}

export function countPlannedDaysThrough(task: TaskItem, day: string): number {
  if (task.schedule.type !== "weekdays") return 0;

  let count = 0;
  const cursor = parseDateKey(task.schedule.startDate);
  const end = parseDateKey(day);

  while (cursor <= end) {
    if (task.schedule.weekdays.includes(getIsoWeekday(toDateKey(cursor)))) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

export function isCompletedOn(taskId: string, day: string, completions: TaskCompletion[]): boolean {
  return completions.some((completion) => completion.taskId === taskId && completion.localDate === day);
}


export type QuickReminderKind = "hour" | "evening" | "tomorrow";

/** Local-time reminder presets so nobody has to pick a date and time by hand. */
export function getQuickReminderTime(kind: QuickReminderKind, now = new Date()): Date {
  if (kind === "hour") return new Date(now.getTime() + 60 * 60_000);
  const target = new Date(now);
  if (kind === "evening") {
    target.setHours(19, 0, 0, 0);
    if (target.getTime() - now.getTime() < 15 * 60_000) target.setDate(target.getDate() + 1);
    return target;
  }
  target.setDate(target.getDate() + 1);
  target.setHours(9, 0, 0, 0);
  return target;
}

export function addDays(day: string, count: number): string {
  const date = parseDateKey(day);
  date.setDate(date.getDate() + count);
  return toDateKey(date);
}

/** Seven consecutive local day keys starting at `from`. */
export function getWeekDays(from: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(from, index));
}
