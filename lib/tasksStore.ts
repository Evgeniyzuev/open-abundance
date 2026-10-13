export type SyncStatus = "local" | "pending_sync" | "synced" | "failed";

import { openOfflineDatabase } from "@/lib/offlineDatabase";
import { addDays, daysBetween, toDateKey } from "@/lib/taskSchedule";
import { MAX_TASK_SUBTASKS } from "@/lib/taskSteps";

export type TaskSchedule =
  | { type: "once"; date: string }
  | { type: "daily"; startDate: string; targetDays?: number; infinite: boolean }
  | { type: "weekdays"; startDate: string; weekdays: number[]; targetDays?: number; infinite: boolean };

export type TaskStreakSettings = {
  softMode: boolean;
  hardcore?: boolean;
  initialLives: number;
  livesEveryDays: number;
};

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  subtasks: string[];
  /** Indexes into `subtasks` that are checked off. */
  doneSubtasks?: number[];
  schedule: TaskSchedule;
  streak?: TaskStreakSettings;
  imageUrl?: string;
  thumbnailDataUrl?: string;
  completed: boolean;
  failed?: boolean;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
  sourceNoteId?: string;
  remindAt?: string;
};

export type TaskCompletionType = "done" | "life";

export type TaskCompletion = {
  id: string;
  taskId: string;
  localDate: string;
  type: TaskCompletionType;
  completedAt: string;
  syncStatus: SyncStatus;
};

export type TaskInput = Pick<TaskItem, "id" | "title" | "description" | "schedule" | "syncStatus"> & {
  subtasks?: string[];
  streak?: TaskStreakSettings;
  imageUrl?: string;
  thumbnailDataUrl?: string;
  sourceNoteId?: string;
  remindAt?: string;
};

export const TASKS_CHANGED_EVENT = "open-abundance:tasks-changed";

const TASKS_STORE = "tasks";
const TASK_COMPLETIONS_STORE = "taskCompletions";

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      db.close();
      if (mode === "readwrite" && typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getTasks(): Promise<TaskItem[]> {
  const tasks = await getAllTasks();
  return tasks.filter((task) => !task.deleted);
}

export async function getAllTasks(): Promise<TaskItem[]> {
  const tasks = await withStore<TaskItem[]>(TASKS_STORE, "readonly", (store) => store.getAll());
  return tasks.map(normalizeTask).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTaskCompletions(): Promise<TaskCompletion[]> {
  const completions = await withStore<TaskCompletion[]>(TASK_COMPLETIONS_STORE, "readonly", (store) => store.getAll());
  return completions.map(normalizeCompletion);
}

export async function saveTask(input: TaskInput): Promise<TaskItem> {
  const now = new Date().toISOString();
  const existing = await getTask(input.id);
  const task: TaskItem = {
    id: input.id,
    title: input.title,
    description: input.description,
    subtasks: input.subtasks ?? existing?.subtasks ?? [],
    doneSubtasks: existing?.doneSubtasks,
    schedule: input.schedule,
    streak: input.streak ?? existing?.streak,
    imageUrl: input.imageUrl,
    thumbnailDataUrl: input.thumbnailDataUrl,
    completed: existing?.completed ?? false,
    failed: existing?.failed,
    failedAt: existing?.failedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus,
    sourceNoteId: input.sourceNoteId ?? existing?.sourceNoteId,
    remindAt: input.remindAt ?? existing?.remindAt
  };

  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) => store.put(task));
  return task;
}

/** Appends accepted steps to one task without rewriting its other fields. */
export async function appendTaskSubtasks(taskId: string, steps: string[]): Promise<TaskItem | undefined> {
  const task = await getTask(taskId);
  if (!task) return undefined;
  const known = new Set(task.subtasks.map((step) => step.trim().toLowerCase()));
  const added = steps.map((step) => step.trim()).filter((step) => step && !known.has(step.toLowerCase()));
  if (added.length === 0) return task;
  const next: TaskItem = {
    ...task,
    subtasks: [...task.subtasks, ...added].slice(0, MAX_TASK_SUBTASKS),
    updatedAt: new Date().toISOString(),
    syncStatus: "local"
  };
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) => store.put(next));
  return next;
}

/** Sets or clears the one-off reminder; a one-time task moves to the reminder's local date. */
export async function setTaskReminder(taskId: string, remindAt: string | undefined): Promise<TaskItem | undefined> {
  const task = await getTask(taskId);
  if (!task) return undefined;
  const schedule: TaskSchedule = remindAt && task.schedule.type === "once"
    ? { type: "once", date: toDateKey(new Date(remindAt)) }
    : task.schedule;
  const next: TaskItem = { ...task, remindAt, schedule, updatedAt: new Date().toISOString(), syncStatus: "local" };
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) => store.put(next));
  return next;
}

/** Moves a one-time task (and its reminder, if any) one day later. */
export async function postponeTask(taskId: string): Promise<TaskItem | undefined> {
  const task = await getTask(taskId);
  if (!task || task.schedule.type !== "once") return task;
  return rescheduleOnceTask(taskId, addDays(task.schedule.date, 1));
}

/** Moves a one-time task to another date; its reminder keeps the same time of day. */
export async function rescheduleOnceTask(taskId: string, date: string): Promise<TaskItem | undefined> {
  const task = await getTask(taskId);
  if (!task || task.schedule.type !== "once") return task;
  const shiftDays = daysBetween(task.schedule.date, date);
  const next: TaskItem = {
    ...task,
    schedule: { type: "once", date },
    remindAt: task.remindAt ? new Date(new Date(task.remindAt).getTime() + shiftDays * 24 * 60 * 60_000).toISOString() : undefined,
    updatedAt: new Date().toISOString(),
    syncStatus: "local"
  };
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) => store.put(next));
  return next;
}

/** Persists the checked state of one subtask so progress survives closing the card. */
export async function toggleTaskSubtask(taskId: string, index: number): Promise<TaskItem | undefined> {
  const task = await getTask(taskId);
  if (!task || index < 0 || index >= task.subtasks.length) return task;
  const done = new Set(task.doneSubtasks ?? []);
  if (done.has(index)) done.delete(index);
  else done.add(index);
  const next: TaskItem = { ...task, doneSubtasks: [...done].sort((a, b) => a - b), updatedAt: new Date().toISOString(), syncStatus: "local" };
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) => store.put(next));
  return next;
}

export async function completeTaskDay(taskId: string, localDate: string, type: TaskCompletionType = "done"): Promise<void> {
  const existing = await getTaskCompletion(taskId, localDate);
  if (existing) return;

  const completion: TaskCompletion = {
    id: `${taskId}:${localDate}`,
    taskId,
    localDate,
    type,
    completedAt: new Date().toISOString(),
    syncStatus: "local"
  };

  await withStore<IDBValidKey>(TASK_COMPLETIONS_STORE, "readwrite", (store) => store.put(completion));
  const task = await getTask(taskId);
  if (task && task.schedule.type === "once" && type === "done") {
    await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
      store.put({ ...task, completed: true, updatedAt: new Date().toISOString(), syncStatus: "local" })
    );
  }
}

export async function completeTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
    store.put({ ...task, completed: true, updatedAt: new Date().toISOString(), syncStatus: "local" })
  );
}

export async function failTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;
  const now = new Date().toISOString();
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
    store.put({ ...task, completed: true, failed: true, failedAt: now, updatedAt: now, syncStatus: "local" })
  );
}

export async function deleteTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;
  await withStore<IDBValidKey>(TASKS_STORE, "readwrite", (store) =>
    store.put({ ...task, deleted: true, updatedAt: new Date().toISOString(), syncStatus: "local" })
  );
}

export async function purgeTask(id: string): Promise<void> {
  const completions = await getTaskCompletions();
  await withStore<undefined>(TASKS_STORE, "readwrite", (store) => store.delete(id));
  await Promise.all(
    completions
      .filter((completion) => completion.taskId === id)
      .map((completion) => withStore<undefined>(TASK_COMPLETIONS_STORE, "readwrite", (store) => store.delete(completion.id)))
  );
}

async function getTask(id: string): Promise<TaskItem | undefined> {
  const task = await withStore<TaskItem | undefined>(TASKS_STORE, "readonly", (store) => store.get(id));
  return task ? normalizeTask(task) : undefined;
}

async function getTaskCompletion(taskId: string, localDate: string): Promise<TaskCompletion | undefined> {
  return withStore<TaskCompletion | undefined>(TASK_COMPLETIONS_STORE, "readonly", (store) => store.get(`${taskId}:${localDate}`));
}

function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    description: task.description ?? "",
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    doneSubtasks: Array.isArray(task.doneSubtasks) ? task.doneSubtasks.filter((index) => Number.isInteger(index)) : undefined,
    streak: normalizeStreakSettings(task.streak),
    completed: Boolean(task.completed),
    failed: Boolean(task.failed),
    syncStatus: "local"
  };
}

function normalizeStreakSettings(settings: TaskStreakSettings | undefined): TaskStreakSettings | undefined {
  if (!settings) return undefined;
  const legacyHardcore = Boolean(settings.hardcore);
  return {
    softMode: typeof settings.softMode === "boolean" ? settings.softMode : !legacyHardcore,
    hardcore: legacyHardcore,
    initialLives: Math.max(0, Math.floor(Number(settings.initialLives) || 0)),
    livesEveryDays: Math.max(0, Math.floor(Number(settings.livesEveryDays) || 0))
  };
}

function normalizeCompletion(completion: TaskCompletion): TaskCompletion {
  return {
    ...completion,
    type: completion.type === "life" ? "life" : "done",
    syncStatus: "local"
  };
}
