// Builds an iCalendar (.ics) file from local tasks (no imports, tested directly by node).
// One-way snapshot: calendars import it, nothing syncs back and no server is involved.

export type CalendarTask = {
  id: string;
  title: string;
  description: string;
  subtasks: string[];
  completed: boolean;
  deleted?: boolean;
  remindAt?: string;
  schedule:
    | { type: "once"; date: string }
    | { type: "daily"; startDate: string; targetDays?: number; infinite: boolean }
    | { type: "weekdays"; startDate: string; weekdays: number[]; targetDays?: number; infinite: boolean };
};

const BY_DAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const EVENT_MINUTES = 30;

export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets as RFC 5545 requires (continuation lines start with a space). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function icsDate(day: string): string {
  return day.replace(/-/g, "");
}

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}

function taskEvent(task: CalendarTask, stamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${task.id}@open-abundance.app`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeIcsText(task.title)}`];
  const details = [task.description.trim(), ...task.subtasks.map((step) => `• ${step}`)].filter(Boolean).join("\n");
  if (details) lines.push(`DESCRIPTION:${escapeIcsText(details)}`);

  const schedule = task.schedule;
  const remindAt = task.remindAt ? new Date(task.remindAt) : null;
  if (schedule.type === "once" && remindAt && Number.isFinite(remindAt.getTime())) {
    lines.push(`DTSTART:${icsUtc(remindAt)}`, `DTEND:${icsUtc(new Date(remindAt.getTime() + EVENT_MINUTES * 60_000))}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcsText(task.title)}`, "TRIGGER:PT0M", "END:VALARM");
  } else {
    const start = schedule.type === "once" ? schedule.date : schedule.startDate;
    lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(start))}`);
    if (schedule.type !== "once") {
      const count = !schedule.infinite && schedule.targetDays ? `;COUNT=${schedule.targetDays}` : "";
      if (schedule.type === "daily") lines.push(`RRULE:FREQ=DAILY${count}`);
      else {
        const days = schedule.weekdays.map((day) => BY_DAY[day]).filter(Boolean);
        if (days.length > 0) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${days.join(",")}${count}`);
      }
    }
  }
  lines.push("END:VEVENT");
  return lines;
}

/** Active tasks only (not finished, not deleted). Lines end with CRLF as calendars expect. */
export function buildTasksIcs(tasks: CalendarTask[], options: { now?: Date; calendarName: string }): string {
  const stamp = icsUtc(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Open Abundance//Tasks//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    ...tasks.filter((task) => !task.completed && !task.deleted).flatMap((task) => taskEvent(task, stamp)),
    "END:VCALENDAR"
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function activeCalendarTaskCount(tasks: CalendarTask[]): number {
  return tasks.filter((task) => !task.completed && !task.deleted).length;
}
