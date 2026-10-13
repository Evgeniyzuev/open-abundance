/** Shared contract for a one-week routine plan (for example meals) with a shopping list. */

export const MAX_ROUTINE_REQUEST = 500;
export const MAX_ROUTINE_TITLE = 100;
export const MAX_SHOPPING_ITEM = 60;
/** Equal to MAX_TASK_SUBTASKS: the list becomes the subtasks of one task. */
export const MAX_SHOPPING_ITEMS = 20;

export type RoutineDay = {
  /** Days from today, 0 to 6. */
  offset: number;
  title: string;
};

export type RoutinePlan = {
  days: RoutineDay[];
  shopping: string[];
};

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

/** Keeps one entry per day (0-6), a capped unique shopping list, and drops everything else. */
export function normalizeRoutinePlan(value: unknown): RoutinePlan | null {
  const raw = value as { days?: unknown; shopping?: unknown } | null;
  if (!Array.isArray(raw?.days)) return null;

  const byOffset = new Map<number, RoutineDay>();
  for (const entry of raw.days) {
    const item = entry as { offset?: unknown; title?: unknown } | null;
    const offset = typeof item?.offset === "number" ? Math.round(item.offset) : Number.NaN;
    const title = clean(item?.title, MAX_ROUTINE_TITLE);
    if (!Number.isInteger(offset) || offset < 0 || offset > 6 || !title || byOffset.has(offset)) continue;
    byOffset.set(offset, { offset, title });
  }
  if (byOffset.size === 0) return null;

  const seen = new Set<string>();
  const shopping: string[] = [];
  for (const entry of Array.isArray(raw.shopping) ? raw.shopping : []) {
    const text = clean(entry, MAX_SHOPPING_ITEM);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    shopping.push(text);
    if (shopping.length >= MAX_SHOPPING_ITEMS) break;
  }
  return { days: [...byOffset.values()].sort((a, b) => a.offset - b.offset), shopping };
}

export function isRoutinePlan(value: unknown): value is RoutinePlan {
  const raw = value as RoutinePlan | null;
  return Boolean(raw) && Array.isArray(raw?.days) && Array.isArray(raw?.shopping);
}
