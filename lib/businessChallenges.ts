// Pure rules of the "business" track (no imports, tested directly by node). The route reads the facts
// (completed Market deals, published reviews, invitations, humanity checks) and these helpers decide.

export const BUSINESS_REVIEWS_TARGET = 3;
export const BUSINESS_BUYERS_TARGET = 2;

/** Distinct, non-empty ids other than the excluded person (a seller never counts as their own buyer). */
export function distinctOthers(ids: Array<string | null | undefined>, selfId: string): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id !== selfId))];
}

/** Buyers who are neither invited by the seller nor the person who invited them: the "stranger" buyers. */
export function strangerBuyers(buyerIds: string[], relatedIds: string[]): string[] {
  const related = new Set(relatedIds);
  return buyerIds.filter((id) => !related.has(id));
}

/** Buyers who were invited by the seller (they joined through the seller's link). */
export function invitedBuyers(buyerIds: string[], invitedIds: string[]): string[] {
  const invited = new Set(invitedIds);
  return buyerIds.filter((id) => invited.has(id));
}
