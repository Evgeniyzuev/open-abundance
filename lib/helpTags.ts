import { NICHES } from "@/lib/nicheTasks";

/**
 * Fixed tag vocabulary for the "can help / need help" profile. Offers reuse the niche keys of the
 * "Choose a direction" challenge so the coordinator sees one vocabulary across the product.
 * No free text: tags cannot carry personal details and match deterministically.
 */
export const OFFER_TAGS: string[] = NICHES.map((niche) => niche.key);

export const NEED_TAGS = [
  "first_step",
  "feedback",
  "accountability",
  "skill_teacher",
  "first_client",
  "contacts",
  "time",
  "funding"
] as const;

export type NeedTag = (typeof NEED_TAGS)[number];

export function cleanTags(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && allowed.includes(item)) unique.add(item);
  }
  return Array.from(unique).slice(0, 12);
}
