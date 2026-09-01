export const MARKETPLACE_RATING_ERROR = "Rating must be between 0.0 and 5.0 in 0.1 increments.";

/**
 * Normalize a Marketplace review rating to one decimal place without
 * accepting values that would be silently rounded by the database.
 */
export function normalizeMarketplaceRating(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim().replace(",", "."))
      : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) return null;

  const tenths = Math.round(parsed * 10);
  const normalized = tenths / 10;
  return Math.abs(parsed - normalized) < 1e-9 ? normalized : null;
}
