/**
 * Shared contract for sorting a free-form brain dump into a short plan.
 * The raw text is never stored; only items the person confirms become tasks or a note.
 */

export const BRAIN_DUMP_BUCKETS = ["now", "today", "later", "drop"] as const;
export type BrainDumpBucket = (typeof BRAIN_DUMP_BUCKETS)[number];

export const MAX_BRAIN_DUMP_ITEMS = 12;
export const MAX_FOCUS_ITEMS = 3;
export const MAX_BRAIN_DUMP_TEXT = 6_000;

export type BrainDumpItem = {
  text: string;
  bucket: BrainDumpBucket;
};

export type BrainDumpResponse = {
  items: BrainDumpItem[];
};

/** Cleans model output: valid buckets, unique short items, and at most three for now + today. */
export function normalizeBrainDumpItems(value: unknown): BrainDumpItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: BrainDumpItem[] = [];
  for (const entry of value) {
    const raw = entry as { text?: unknown; bucket?: unknown } | null;
    const text = typeof raw?.text === "string" ? raw.text.replace(/\s+/g, " ").trim().slice(0, 140) : "";
    const bucket = BRAIN_DUMP_BUCKETS.find((candidate) => candidate === raw?.bucket);
    const key = text.toLowerCase();
    if (!text || !bucket || seen.has(key)) continue;
    seen.add(key);
    items.push({ text, bucket });
    if (items.length >= MAX_BRAIN_DUMP_ITEMS) break;
  }

  // "now" items claim the focus slots first; anything past three moves to "later".
  const focusOrder = [...items.filter((item) => item.bucket === "now"), ...items.filter((item) => item.bucket === "today")];
  const demoted = new Set(focusOrder.slice(MAX_FOCUS_ITEMS));
  return items.map((item) => (demoted.has(item) ? { ...item, bucket: "later" as const } : item));
}

export function isBrainDumpResponse(value: unknown): value is BrainDumpResponse {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as BrainDumpResponse).items);
}
