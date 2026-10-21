// Who can see a marketplace listing without an account. Active listings get a public page by default;
// the seller can hide one from guests. Stored in marketplace_listings.metadata, so no schema change is needed.

export const GUEST_HIDDEN_KEY = "hidden_from_guests";
export const GUEST_REVIEW_KEY = "guest_review";

/** Result of the automatic text check and the operator's decision (lib/marketplaceListingCheck.ts). */
export type GuestReview = {
  status: "pending" | "approved" | "rejected";
  flags: string[];
  checkedAt: string;
  reviewedAt?: string;
};

/** Public pages enter search indexes only when the text is substantial and the seller passed the humanity check. */
export const INDEXABLE_MIN_DESCRIPTION_CHARS = 80;
export const INDEXABLE_MIN_HUMANITY_LEVEL = 2;

export function isHiddenFromGuests(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && (metadata as Record<string, unknown>)[GUEST_HIDDEN_KEY] === true);
}

export function guestReview(metadata: unknown): GuestReview | null {
  const value = asRecord(metadata)[GUEST_REVIEW_KEY];
  if (!value || typeof value !== "object") return null;
  const review = value as Partial<GuestReview>;
  if (review.status !== "pending" && review.status !== "approved" && review.status !== "rejected") return null;
  return { status: review.status, flags: Array.isArray(review.flags) ? review.flags.filter((flag): flag is string => typeof flag === "string") : [], checkedAt: String(review.checkedAt ?? ""), ...(review.reviewedAt ? { reviewedAt: String(review.reviewedAt) } : {}) };
}

/** A guest sees the public page unless the seller hid it or the listing waits for review or was rejected. */
export function isPublicForGuests(metadata: unknown): boolean {
  const status = guestReview(metadata)?.status;
  return !isHiddenFromGuests(metadata) && status !== "pending" && status !== "rejected";
}

/**
 * Applies a fresh automatic check after the text was created or changed.
 * Flags put the listing on review; a clean text clears an automatic hold, sends a rejected listing back to review
 * (the seller may have fixed it), and keeps an operator approval.
 */
export function withAutoCheck(metadata: unknown, flags: string[], now: string): Record<string, unknown> {
  const base = asRecord(metadata);
  const previous = guestReview(metadata);
  if (flags.length) return { ...base, [GUEST_REVIEW_KEY]: { status: "pending", flags, checkedAt: now } };
  if (previous?.status === "rejected") return { ...base, [GUEST_REVIEW_KEY]: { status: "pending", flags: [], checkedAt: now } };
  if (previous?.status === "pending") {
    const { [GUEST_REVIEW_KEY]: _removed, ...rest } = base;
    return rest;
  }
  return base;
}

export function withOperatorReview(metadata: unknown, status: "approved" | "rejected", now: string): Record<string, unknown> {
  const previous = guestReview(metadata);
  return { ...asRecord(metadata), [GUEST_REVIEW_KEY]: { status, flags: previous?.flags ?? [], checkedAt: previous?.checkedAt ?? now, reviewedAt: now } };
}

function asRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
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
