// Who can see a marketplace listing without an account. Active listings get a public page by default;
// the seller can hide one from guests. Stored in marketplace_listings.metadata, so no schema change is needed.

export const GUEST_HIDDEN_KEY = "hidden_from_guests";

/** Public pages enter search indexes only when the text is substantial and the seller passed the humanity check. */
export const INDEXABLE_MIN_DESCRIPTION_CHARS = 80;
export const INDEXABLE_MIN_HUMANITY_LEVEL = 2;

export function isHiddenFromGuests(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && (metadata as Record<string, unknown>)[GUEST_HIDDEN_KEY] === true);
}

export function withGuestVisibility(metadata: unknown, hidden: boolean): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
  if (hidden) base[GUEST_HIDDEN_KEY] = true;
  else delete base[GUEST_HIDDEN_KEY];
  return base;
}

export function isIndexableListing(description: string | null | undefined, sellerHumanityLevel: number | null | undefined): boolean {
  return (description?.trim().length ?? 0) >= INDEXABLE_MIN_DESCRIPTION_CHARS && (sellerHumanityLevel ?? 0) >= INDEXABLE_MIN_HUMANITY_LEVEL;
}

export function publicListingPath(listingId: string): string {
  return `/m/${listingId}`;
}
