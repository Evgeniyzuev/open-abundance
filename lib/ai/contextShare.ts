// Optional parts of Nova's context the person switches on in AI settings (no imports, tested directly by node).
// Everything is read from this device only: tasks, notes and lists live in IndexedDB, balances come from the
// already loaded profile. Nothing extra is requested from the server and nothing is stored there.

export type AiContextShare = {
  tasks: boolean;
  notes: boolean;
  progress: boolean;
  finance: boolean;
};

export const DEFAULT_AI_CONTEXT_SHARE: AiContextShare = { tasks: false, notes: false, progress: false, finance: false };

export const AI_CONTEXT_SHARE_KEYS = ["tasks", "notes", "progress", "finance"] as const satisfies ReadonlyArray<keyof AiContextShare>;

/** Line prefixes the chat route accepts for these parts; keep in sync with the route allowlist. */
export const AI_CONTEXT_SHARE_PREFIXES = ["task:", "note:", "progress:", "finance:"] as const;

export const MAX_SHARED_TASKS = 15;
export const MAX_SHARED_NOTES = 12;
export const MAX_SHARED_CONTEXT_CHARS = 3_500;

type ShareTask = {
  id: string;
  title: string;
  subtasks: string[];
  doneSubtasks?: number[];
  schedule: { type: "once"; date: string } | { type: "daily"; startDate: string } | { type: "weekdays"; startDate: string; weekdays: number[] };
  completed: boolean;
  failed?: boolean;
  deleted?: boolean;
  updatedAt: string;
};

type ShareCompletion = { taskId: string; localDate: string; type: string };

type ShareNote = { title: string; body: string; listId?: string; completed: boolean; deleted?: boolean; updatedAt: string; kind?: string };

type ShareList = { id: string; title: string; deleted?: boolean };

export type AiContextShareInput = {
  today: string;
  tasks?: ShareTask[];
  completions?: ShareCompletion[];
  notes?: ShareNote[];
  lists?: ShareList[];
  coreBalance?: number | null;
  walletBalance?: number | null;
};

export function normalizeAiContextShare(value: unknown): AiContextShare {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    tasks: source.tasks === true,
    notes: source.notes === true,
    progress: source.progress === true,
    finance: source.finance === true
  };
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function shiftDay(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function whenLabel(task: ShareTask, today: string): { label: string; rank: number } {
  const schedule = task.schedule;
  if (schedule.type === "once") {
    if (schedule.date < today) return { label: `overdue since ${schedule.date}`, rank: 0 };
    if (schedule.date === today) return { label: "today", rank: 1 };
    return { label: `on ${schedule.date}`, rank: 3 };
  }
  if (schedule.startDate > today) return { label: `starts ${schedule.startDate}`, rank: 4 };
  if (schedule.type === "daily") return { label: "daily", rank: 2 };
  const dueToday = schedule.weekdays.includes(isoWeekday(today));
  return { label: dueToday ? "today (weekly routine)" : "weekly routine", rank: dueToday ? 2 : 3 };
}

function taskLines(input: AiContextShareInput): string[] {
  const doneToday = new Set((input.completions ?? []).filter((item) => item.localDate === input.today && item.type === "done").map((item) => item.taskId));
  return (input.tasks ?? [])
    .filter((task) => !task.deleted && !task.completed && !task.failed && task.title.trim())
    .map((task) => ({ task, when: whenLabel(task, input.today) }))
    .sort((left, right) => left.when.rank - right.when.rank || right.task.updatedAt.localeCompare(left.task.updatedAt))
    .slice(0, MAX_SHARED_TASKS)
    .map(({ task, when }) => {
      const done = new Set(task.doneSubtasks ?? []);
      const nextStep = task.subtasks.find((_, index) => !done.has(index));
      const parts = [clip(task.title, 100), when.label];
      if (task.subtasks.length) parts.push(`steps ${done.size}/${task.subtasks.length}`);
      if (nextStep) parts.push(`next step: ${clip(nextStep, 80)}`);
      if (doneToday.has(task.id)) parts.push("done today");
      return `task: ${parts.join("; ")}`;
    });
}

function noteLines(input: AiContextShareInput): string[] {
  const listTitles = new Map((input.lists ?? []).filter((list) => !list.deleted).map((list) => [list.id, list.title]));
  return (input.notes ?? [])
    .filter((note) => !note.deleted && !note.completed && (note.title.trim() || note.body.trim()))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_SHARED_NOTES)
    .map((note) => {
      const list = note.listId ? listTitles.get(note.listId) : undefined;
      const head = [list ? `[${clip(list, 40)}]` : "", note.kind === "reflection" ? "(thought)" : "", clip(note.title, 80)].filter(Boolean).join(" ");
      const body = note.body.trim() && note.body.trim() !== note.title.trim() ? ` — ${clip(note.body, 160)}` : "";
      return `note: ${head}${body}`;
    });
}

function progressLines(input: AiContextShareInput): string[] {
  const weekStart = shiftDay(input.today, -6);
  const done = (input.completions ?? []).filter((item) => item.type === "done" && item.localDate >= weekStart && item.localDate <= input.today);
  const activeDays = new Set(done.map((item) => item.localDate)).size;
  const today = done.filter((item) => item.localDate === input.today).length;
  return [`progress: last 7 days ${done.length} task check-offs on ${activeDays} of 7 days; today ${today}`];
}

function financeLines(input: AiContextShareInput): string[] {
  const lines: string[] = [];
  if (typeof input.coreBalance === "number" && Number.isFinite(input.coreBalance)) lines.push(`finance: Core balance $${input.coreBalance.toFixed(2)}`);
  if (typeof input.walletBalance === "number" && Number.isFinite(input.walletBalance)) lines.push(`finance: Wallet balance $${input.walletBalance.toFixed(2)}`);
  return lines;
}

/** Lines for the parts the person switched on, within a fixed size budget. */
export function buildSharedContextLines(share: AiContextShare, input: AiContextShareInput): string[] {
  const lines = [
    ...(share.progress ? progressLines(input) : []),
    ...(share.finance ? financeLines(input) : []),
    ...(share.tasks ? taskLines(input) : []),
    ...(share.notes ? noteLines(input) : [])
  ];
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > MAX_SHARED_CONTEXT_CHARS) break;
    kept.push(line);
    size += line.length + 1;
  }
  return kept;
}
