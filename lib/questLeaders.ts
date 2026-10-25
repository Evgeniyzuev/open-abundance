// Leaders of the week on the growth path: who finished the most quests in the last 7 days. Shown to everyone in the
// quest log, used by Nova to praise the leaders and by the daily analytics. Pure, no imports, tested by node.

export const LEADERS_WINDOW_MS = 7 * 86_400_000;
export const LEADERS_LIMIT = 5;
/** Fewer quests than this in a week is not a pace worth showing. */
export const LEADERS_MIN_QUESTS = 2;

export type LeaderRow = { user_id: string; challenge_id: string; status: string | null; updated_at: string | null };
export type Leader = { userId: string; quests: number; lastAt: number };

/**
 * Ranks people by quests completed within the window (onboarding quests do not count). Ties go to whoever got there
 * first, so a leader is not overtaken by someone who only matched the count later.
 */
export function weeklyLeaders(rows: LeaderRow[], onboardingIds: Set<string>, now: number, limit = LEADERS_LIMIT): Leader[] {
  const byUser = new Map<string, Leader>();
  for (const row of rows) {
    if (String(row.status ?? "").toLowerCase() !== "completed" || onboardingIds.has(row.challenge_id)) continue;
    const at = Date.parse(String(row.updated_at ?? ""));
    if (!Number.isFinite(at) || at > now || now - at > LEADERS_WINDOW_MS) continue;
    const entry = byUser.get(row.user_id) ?? { userId: row.user_id, quests: 0, lastAt: 0 };
    entry.quests += 1;
    entry.lastAt = Math.max(entry.lastAt, at);
    byUser.set(row.user_id, entry);
  }
  return [...byUser.values()]
    .filter((leader) => leader.quests >= LEADERS_MIN_QUESTS)
    .sort((left, right) => right.quests - left.quests || left.lastAt - right.lastAt)
    .slice(0, limit);
}
