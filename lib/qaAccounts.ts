/**
 * Test accounts used for live QA of the app (Claude's browser runs against production). They are left out of public
 * boards, Nova nudges and the daily analytics so the experiment's numbers stay about real people.
 */
export const QA_USER_IDS: ReadonlySet<string> = new Set([
  // qa-claude@example.com, created 2026-10-25 for walking the quest path in a browser.
  "3dbbec5f-2f5a-4004-80cd-210405e24113",
  // qa-claude-2@example.com, created 2026-10-26 for walking the first day from a fresh account.
  "3dbbec5f-2f5a-4004-80cd-210405e24114"
]);

export function isQaUser(userId: string | null | undefined): boolean {
  return Boolean(userId && QA_USER_IDS.has(userId));
}

/**
 * The relay of the Open Abundance lead (Evgen, 2026-10-28): qa-claude@example.com leads real members and passes on
 * everything the Open Abundance lead does; the team and leadership tools are tested and grown on it. Its followers
 * count as led by the Open Abundance lead, and their rows stay in the analytics.
 */
export const OA_RELAY_LEAD_ID = "3dbbec5f-2f5a-4004-80cd-210405e24113";

/** Led by the Open Abundance lead: no live lead, or the relay account. */
export function isOaLed(leaderUserId: string | null | undefined): boolean {
  return !leaderUserId || leaderUserId === OA_RELAY_LEAD_ID;
}
