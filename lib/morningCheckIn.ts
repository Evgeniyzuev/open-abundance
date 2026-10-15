// Pure helpers of the morning check-in (no imports, tested directly by node).
// A morning entry is an ordinary note marked `morning`, with optional context labels.

export const MORNING_CONTEXTS = ["work", "money", "health", "family", "learning", "other"] as const;
export type MorningContext = (typeof MORNING_CONTEXTS)[number];

export const MORNING_FIELDS = ["body", "money", "feelings", "mind"] as const;
export type MorningField = (typeof MORNING_FIELDS)[number];

/** Keeps only known, unique context labels, in catalog order. */
export function sanitizeContexts(value: unknown): MorningContext[] {
  if (!Array.isArray(value)) return [];
  return MORNING_CONTEXTS.filter((context) => value.includes(context));
}

/** Labelled lines of the answers that are not empty; the labels come from the caller (i18n). */
export function buildMorningBody(answers: Partial<Record<MorningField, string>>, labels: Record<MorningField, string>): string {
  return MORNING_FIELDS
    .map((field) => ({ label: labels[field], text: (answers[field] ?? "").trim() }))
    .filter((row) => row.text)
    .map((row) => `${row.label}: ${row.text}`)
    .join("\n");
}

export type MorningNoteLike = { createdAt: string; deleted?: boolean; morning?: boolean };

function localDayOf(iso: string): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function hasMorningEntryOn(notes: MorningNoteLike[], day: string): boolean {
  return notes.some((note) => note.morning === true && !note.deleted && localDayOf(note.createdAt) === day);
}

/** Many open contexts is a signal to delegate, not a verdict: the threshold only picks the wording. */
export const MANY_CONTEXTS = 4;
