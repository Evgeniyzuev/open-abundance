// Categories of regular spending a person may want to move into Open Abundance. A fixed vocabulary (no amounts,
// no free text), so a choice cannot carry personal details and counts can be added up. No imports: tested by node.

export const SPEND_CATEGORIES = [
  "food",
  "home",
  "transport",
  "communication",
  "subscriptions",
  "learning",
  "health",
  "clothes",
  "gifts",
  "leisure",
  "services",
  "tools"
] as const;

export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

/** A category is shown to other people only when at least this many people chose it. */
export const DEMAND_MIN_PEOPLE = 5;

export function cleanSpendCategories(value: unknown): SpendCategory[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<SpendCategory>();
  for (const item of value) {
    if (typeof item === "string" && (SPEND_CATEGORIES as readonly string[]).includes(item)) unique.add(item as SpendCategory);
  }
  return Array.from(unique).slice(0, SPEND_CATEGORIES.length);
}

/** Counts per category, only for categories chosen by at least DEMAND_MIN_PEOPLE people, biggest first. */
export function demandMap(rows: Array<{ categories: string[] }>): Array<{ category: SpendCategory; people: number }> {
  const counts = new Map<SpendCategory, number>();
  for (const row of rows) {
    for (const category of cleanSpendCategories(row.categories)) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts, ([category, people]) => ({ category, people }))
    .filter((item) => item.people >= DEMAND_MIN_PEOPLE)
    .sort((a, b) => b.people - a.people || a.category.localeCompare(b.category));
}
