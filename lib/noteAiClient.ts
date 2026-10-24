"use client";

import { ABUNDANCE_LIST_ID, getNotes, setNoteAiReview, type Note } from "@/lib/notesStore";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { MAX_LINK_NOTES, normalizeNoteAiResult, type NoteAiMode, type NoteAiQueueAction, type NoteAiReview } from "@/lib/noteAiReview";
import { trackProductEvent } from "@/lib/productAnalytics";

export type NoteAiRequestFailure = "offline" | "signin" | "quota" | "deep_limit" | "not_ready" | "error";

/** Fired with `{ text }` to open the Nova chat with a prepared message (support or discuss a note). */
export const OPEN_AI_PROMPT_EVENT = "oa:open-ai-prompt";

function noteText(note: Pick<Note, "title" | "body">): string {
  const title = note.title.trim();
  const body = note.body.trim();
  return body && !body.startsWith(title) ? `${title}\n${body}` : body || title;
}

/** Short excerpts of other notes for "links", newest first, same list when it has enough notes. */
function linkContext(note: Note, notes: Note[]): string {
  const others = notes.filter((other) => other.id !== note.id && !other.deleted);
  const sameList = others.filter((other) => (other.listId ?? "") === (note.listId ?? ""));
  const source = (sameList.length >= 5 ? sameList : others).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_LINK_NOTES);
  return source.map((other) => `- ${other.updatedAt.slice(0, 10)}: ${noteText(other).replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
}

/**
 * Sends a note for review. The note shows ⏳ right away; a quick answer usually comes back in the same request,
 * a deep one later through the answers pick-up. On refusal the note goes back to how it was.
 */
export async function requestNoteAiReview(input: {
  note: Note;
  mode: NoteAiMode;
  action: NoteAiQueueAction;
  locale: string;
  listTitles: string[];
}): Promise<{ ok: true; review: NoteAiReview } | { ok: false; reason: NoteAiRequestFailure }> {
  const { note, mode, action, locale, listTitles } = input;
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, reason: "offline" };
  const previous = note.aiReview;
  const pending: NoteAiReview = { status: "pending", mode, action, requestedAt: new Date().toISOString() };
  await setNoteAiReview(note.id, pending);

  let context = "";
  if (action === "links") context = linkContext(note, await getNotes());
  if (action === "sort") context = `Lists: ${listTitles.join(", ")}`;

  try {
    const response = await fetchWithSupabaseAuth("/api/ai/notes/request", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientNoteId: note.id, mode, action, text: noteText(note), context, locale })
    });
    const payload = await response.json().catch(() => null) as { requestId?: string; status?: string; result?: unknown; code?: string; safety?: { title: string; message: string; actions: string[] } } | null;
    if (response.ok && payload?.status === "safety" && payload.safety) {
      const review: NoteAiReview = { ...pending, status: "ready", answeredAt: new Date().toISOString(), result: { text: [payload.safety.title, payload.safety.message, ...payload.safety.actions].join("\n") } };
      await setNoteAiReview(note.id, review);
      return { ok: true, review };
    }
    if (response.ok && payload?.requestId) {
      const result = normalizeNoteAiResult(payload.result);
      const review: NoteAiReview = result
        ? { ...pending, requestId: payload.requestId, status: "ready", answeredAt: new Date().toISOString(), result }
        : { ...pending, requestId: payload.requestId };
      await setNoteAiReview(note.id, review);
      if (result) void acknowledgeAnswers([payload.requestId]);
      trackProductEvent("note_ai_requested", { mode, action });
      return { ok: true, review };
    }
    await setNoteAiReview(note.id, previous);
    if (response.status === 401) return { ok: false, reason: "signin" };
    if (payload?.code === "deep_limit") return { ok: false, reason: "deep_limit" };
    if (response.status === 429) return { ok: false, reason: "quota" };
    if (payload?.code === "not_ready") return { ok: false, reason: "not_ready" };
    return { ok: false, reason: "error" };
  } catch {
    await setNoteAiReview(note.id, previous);
    return { ok: false, reason: "error" };
  }
}

async function acknowledgeAnswers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await fetchWithSupabaseAuth("/api/notes/ai-answers", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids })
  }).catch(() => undefined);
}

/** Picks up answers that came while the app was closed and puts them into their notes. Returns how many arrived. */
export async function pullNoteAiAnswers(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const notes = await getNotes();
  if (!notes.some((note) => note.aiReview?.status === "pending")) return 0;
  try {
    const response = await fetchWithSupabaseAuth("/api/notes/ai-answers", { cache: "no-store" });
    if (!response.ok) return 0;
    const payload = await response.json() as { answers?: Array<{ requestId: string; clientNoteId: string; mode: NoteAiMode; action: NoteAiQueueAction; status: "ready" | "failed"; result: unknown; answeredAt: string }> };
    const delivered: string[] = [];
    for (const answer of payload.answers ?? []) {
      const note = notes.find((item) => item.id === answer.clientNoteId);
      delivered.push(answer.requestId);
      if (!note || note.deleted) continue;
      const result = normalizeNoteAiResult(answer.result);
      await setNoteAiReview(note.id, {
        requestId: answer.requestId,
        mode: answer.mode,
        action: answer.action,
        requestedAt: note.aiReview?.requestedAt ?? answer.answeredAt,
        answeredAt: answer.answeredAt,
        status: answer.status === "ready" && result ? "ready" : "failed",
        result: result ?? undefined
      });
    }
    await acknowledgeAnswers(delivered);
    return delivered.length;
  } catch {
    return 0;
  }
}

// --- The "Abundance" list: its notes are also saved on the server for the team and the AI. ---

const PENDING_ABUNDANCE_KEY = "openAbundancePendingAbundanceNotes";
type PendingAbundance = Record<string, "put" | "delete">;

function readPending(): PendingAbundance {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_ABUNDANCE_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as PendingAbundance : {};
  } catch {
    return {};
  }
}

function writePending(pending: PendingAbundance) {
  try {
    window.localStorage.setItem(PENDING_ABUNDANCE_KEY, JSON.stringify(pending));
  } catch {
    // Without storage a failed send is simply retried the next time the note is saved.
  }
}

async function sendAbundance(noteId: string, op: "put" | "delete", body = ""): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseAuth("/api/abundance/notes", {
      method: op === "put" ? "PUT" : "DELETE",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op === "put" ? { clientNoteId: noteId, body } : { clientNoteId: noteId })
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Call after a note was saved, moved or deleted: keeps the server copy of Abundance notes in step. */
export async function syncAbundanceNote(note: Pick<Note, "id" | "title" | "body" | "listId" | "deleted">, previousListId?: string): Promise<void> {
  const inList = note.listId === ABUNDANCE_LIST_ID && !note.deleted;
  if (!inList && previousListId !== ABUNDANCE_LIST_ID) return;
  const op = inList ? "put" : "delete";
  const pending = readPending();
  pending[note.id] = op;
  writePending(pending);
  if (await sendAbundance(note.id, op, noteText(note))) {
    const next = readPending();
    delete next[note.id];
    writePending(next);
  }
}

/** Retries Abundance notes that could not be sent (offline, signed out). */
export async function flushAbundanceNotes(): Promise<void> {
  const pending = readPending();
  const ids = Object.keys(pending);
  if (ids.length === 0 || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const notes = await getNotes();
  for (const id of ids) {
    const note = notes.find((item) => item.id === id);
    const op = note && !note.deleted && note.listId === ABUNDANCE_LIST_ID ? "put" : "delete";
    if (await sendAbundance(id, op, note ? noteText(note) : "")) {
      const next = readPending();
      delete next[id];
      writePending(next);
    }
  }
}
