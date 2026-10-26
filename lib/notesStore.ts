export type SyncStatus = "local" | "pending_sync" | "synced" | "failed";

import {
  createReflectionProcessing,
  normalizeReflectionProcessing,
  type ReflectionFeedback,
  type ReflectionProcessing,
  type ReflectionProposal
} from "@/lib/reflections";
import { openOfflineDatabase } from "@/lib/offlineDatabase";
import type { NoteAiReview } from "@/lib/noteAiReview";
import { normalizeNoteImages } from "@/lib/noteImages";

export type ReminderList = {
  id: string;
  title: string;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
  serverVersion?: string;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  listId?: string;
  reminders: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: SyncStatus;
  serverVersion?: string;
  kind?: "regular" | "reflection";
  processing?: ReflectionProcessing;
  /** Morning check-in entry and the life contexts the person tagged it with. */
  morning?: boolean;
  contexts?: string[];
  /** The latest AI review of this note: waiting, answered or failed. */
  aiReview?: NoteAiReview;
  /** Earlier answers, newest first: a new review never wipes the previous answer off the device. */
  aiHistory?: NoteAiReview[];
  /** Pictures: a shrunk photo from the device (JPEG data URL) or a link, in the order they were added. */
  images?: string[];
};

/** Built-in lists that cannot be deleted. Notes without a list are in the Inbox; "abundance" is a reserved list id. */
export const ABUNDANCE_LIST_ID = "abundance";

export const NOTES_CHANGED_EVENT = "open-abundance:notes-changed";

const NOTES_STORE = "notes";
const LISTS_STORE = "lists";

type NoteInput = Pick<Note, "id" | "title" | "body" | "syncStatus"> & {
  listId?: string;
  reminders?: string[];
  completed?: boolean;
  kind?: "regular" | "reflection";
  processing?: ReflectionProcessing;
  morning?: boolean;
  contexts?: string[];
  images?: string[];
};

type ListInput = Pick<ReminderList, "id" | "title" | "icon" | "color" | "syncStatus">;

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
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getNotes(): Promise<Note[]> {
  const notes = await withStore<Note[]>(NOTES_STORE, "readonly", (store) => store.getAll());
  return notes.map(normalizeNote);
}

export async function getLists(): Promise<ReminderList[]> {
  const lists = await withStore<ReminderList[]>(LISTS_STORE, "readonly", (store) => store.getAll());
  return lists.map(normalizeList).filter((list) => !list.deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveList(input: ListInput): Promise<ReminderList> {
  const now = new Date().toISOString();
  const existing = await getList(input.id);
  const list: ReminderList = {
    id: input.id,
    title: input.title,
    icon: input.icon || "•",
    color: input.color || "#0f8f72",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus
  };

  await withStore<IDBValidKey>(LISTS_STORE, "readwrite", (store) => store.put(list));
  notifyNotesChanged();
  return list;
}

export async function deleteList(id: string): Promise<void> {
  const existing = await getList(id);
  if (!existing) return;

  await withStore<IDBValidKey>(LISTS_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      deleted: true,
      updatedAt: new Date().toISOString(),
      syncStatus: "local"
    })
  );

  const notes = await getNotes();
  await Promise.all(
    notes
      .filter((note) => note.listId === id)
      .map((note) =>
        withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) =>
          store.put({
            ...note,
            listId: undefined,
            updatedAt: new Date().toISOString(),
            syncStatus: "local"
          })
        )
      )
  );
  notifyNotesChanged();
}

export async function saveNote(input: NoteInput): Promise<Note> {
  const now = new Date().toISOString();
  const existing = await getNote(input.id);
  const note: Note = {
    id: input.id,
    title: input.title,
    body: input.body,
    listId: input.listId ?? existing?.listId,
    reminders: input.reminders ?? existing?.reminders ?? [],
    completed: input.completed ?? existing?.completed ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: input.syncStatus,
    kind: input.kind ?? existing?.kind ?? "regular",
    processing: input.processing ?? existing?.processing,
    morning: input.morning ?? existing?.morning,
    contexts: input.contexts ?? existing?.contexts,
    images: input.images ? normalizeNoteImages(input.images) : existing?.images,
    aiReview: existing?.aiReview,
    aiHistory: existing?.aiHistory
  };

  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) => store.put(note));
  notifyNotesChanged();
  return note;
}

/** Saves imported notes in one transaction and refreshes screens once. Keeps the original creation date. */
export async function importNotesBatch(items: Array<{ title: string; body: string; listId?: string; createdAt?: string }>): Promise<number> {
  if (items.length === 0) return 0;
  const now = new Date().toISOString();
  const db = await openOfflineDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readwrite");
    const store = tx.objectStore(NOTES_STORE);
    for (const item of items) {
      const note: Note = {
        id: crypto.randomUUID(),
        title: item.title,
        body: item.body,
        listId: item.listId,
        reminders: [],
        completed: false,
        createdAt: item.createdAt ?? now,
        updatedAt: now,
        syncStatus: "local",
        kind: "regular"
      };
      store.put(note);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  notifyNotesChanged();
  return items.length;
}

export async function toggleNoteCompleted(id: string): Promise<void> {
  const existing = await getNote(id);
  if (!existing) return;
  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      completed: !existing.completed,
      updatedAt: new Date().toISOString(),
      syncStatus: "local"
    })
  );
  notifyNotesChanged();
}

export async function saveReflectionCapture(body: string): Promise<Note> {
  const text = body.trim();
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? "";
  return saveNote({
    id: crypto.randomUUID(),
    title: (firstLine || text).slice(0, 90),
    body: text,
    kind: "reflection",
    processing: createReflectionProcessing(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    syncStatus: "local"
  });
}

export async function updateReflectionProcessing(id: string, processing: ReflectionProcessing): Promise<Note | undefined> {
  const note = await getNote(id);
  if (!note || note.kind !== "reflection") return undefined;
  return saveNote({
    id: note.id,
    title: note.title,
    body: note.body,
    listId: note.listId,
    reminders: note.reminders,
    completed: processing.status === "closed",
    kind: "reflection",
    processing,
    syncStatus: "local"
  });
}

export async function setReflectionProposal(id: string, proposal: ReflectionProposal): Promise<Note | undefined> {
  const note = await getNote(id);
  if (!note?.processing) return undefined;
  return updateReflectionProcessing(id, { ...note.processing, proposal, status: "ready" });
}

export async function linkReflectionTask(noteId: string, taskId: string): Promise<void> {
  const note = await getNote(noteId);
  if (!note?.processing) return;
  await updateReflectionProcessing(noteId, {
    ...note.processing,
    linkedTaskId: taskId,
    status: "planned"
  });
}

export async function closeReflectionForTask(taskId: string): Promise<void> {
  const notes = await getNotes();
  const note = notes.find((item) => item.processing?.linkedTaskId === taskId);
  if (!note?.processing) return;
  await updateReflectionProcessing(note.id, {
    ...note.processing,
    status: "closed",
    completedAt: new Date().toISOString()
  });
}

export async function closeReflection(id: string, feedback?: ReflectionFeedback): Promise<void> {
  const note = await getNote(id);
  if (!note?.processing) return;
  await updateReflectionProcessing(id, {
    ...note.processing,
    status: "closed",
    completedAt: new Date().toISOString(),
    feedback: feedback ?? note.processing.feedback
  });
}

export async function setReflectionFeedback(id: string, feedback: ReflectionFeedback): Promise<void> {
  const note = await getNote(id);
  if (!note?.processing) return;
  await updateReflectionProcessing(id, { ...note.processing, feedback });
}

const AI_HISTORY_LIMIT = 5;

/**
 * Sets (or with `undefined` clears) the AI review of a note without touching its text or its "updated" time. A ready
 * answer that is being replaced by another review moves to `aiHistory`, so answers are kept on the device: the server
 * deletes them once delivered.
 */
export async function setNoteAiReview(id: string, aiReview: NoteAiReview | undefined): Promise<Note | undefined> {
  const existing = await getNote(id);
  if (!existing) return undefined;
  const previous = existing.aiReview;
  let history = existing.aiHistory ?? [];
  if (previous?.status === "ready" && previous.result && previous.requestedAt !== aiReview?.requestedAt) {
    history = [{ ...previous, hidden: undefined }, ...history.filter((item) => item.requestedAt !== previous.requestedAt)];
  }
  if (aiReview) history = history.filter((item) => item.requestedAt !== aiReview.requestedAt);
  const note: Note = { ...existing, aiReview, aiHistory: history.length ? history.slice(0, AI_HISTORY_LIMIT) : undefined };
  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) => store.put(note));
  notifyNotesChanged();
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  const existing = await getNote(id);
  if (!existing) return;
  await withStore<IDBValidKey>(NOTES_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      deleted: true,
      updatedAt: new Date().toISOString(),
      syncStatus: "local"
    })
  );
  notifyNotesChanged();
}

async function getNote(id: string): Promise<Note | undefined> {
  const note = await withStore<Note | undefined>(NOTES_STORE, "readonly", (store) => store.get(id));
  return note ? normalizeNote(note) : undefined;
}

async function getList(id: string): Promise<ReminderList | undefined> {
  const list = await withStore<ReminderList | undefined>(LISTS_STORE, "readonly", (store) => store.get(id));
  return list ? normalizeList(list) : undefined;
}

function normalizeNote(note: Note): Note {
  const processing = normalizeReflectionProcessing(note.processing);
  const normalizedProcessing = processing && processing.status !== "closed"
    ? { ...processing, reviewAt: processing.reviewAt ?? addHours(note.createdAt, 24) }
    : processing;
  return {
    ...note,
    reminders: Array.isArray(note.reminders) ? note.reminders : [],
    completed: Boolean(note.completed),
    syncStatus: "local",
    kind: note.kind ?? "regular",
    processing: normalizedProcessing,
    images: normalizeNoteImages(note.images)
  };
}

export function isReflectionDue(note: Note, now = Date.now()): boolean {
  if (note.deleted || note.kind !== "reflection" || !note.processing) return false;
  if (!["inbox", "clarifying", "ready", "waiting"].includes(note.processing.status)) return false;
  const reviewAt = note.processing.reviewAt ? new Date(note.processing.reviewAt).getTime() : NaN;
  return Number.isFinite(reviewAt) && reviewAt <= now;
}

function addHours(value: string, hours: number): string {
  const time = new Date(value).getTime();
  return new Date((Number.isFinite(time) ? time : Date.now()) + hours * 60 * 60 * 1000).toISOString();
}

function notifyNotesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
}

function normalizeList(list: ReminderList): ReminderList {
  return {
    ...list,
    syncStatus: "local"
  };
}
