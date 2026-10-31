// «3 дня» and «Помоги новичку» (migration 20261031120000, no imports, tested by node).
// Founder decision 2026-10-31: both must be plain and checkable by the button in the task.
// «3 дня»: any 3 days (not in a row) with at least one completed task. «Помоги новичку»: a person who came by your link
// or is in your team completes any task after you took this one.

export const FOCUS_DAYS_LOGIC = "three_day_focus";
export const FOCUS_DAYS_TARGET = 3;
export const HELP_NEWCOMER_LOGIC = "team_task_help_completed";
/** Shown in the task card; the check itself looks at every newcomer. */
export const HELP_NEWCOMER_LIST_LIMIT = 20;

export type QuestCompletionRow = {
  challenge_id: string;
  status: string;
  reward_settled_at: string | null;
  updated_at: string | null;
  /** The challenge category; achievements are not tasks. */
  category?: string | null;
};

const ACHIEVEMENT = "achievement";

/** When a task was completed: the reward time when there is one, otherwise the last update. */
export function completedAt(row: QuestCompletionRow): number | null {
  if (String(row.status).trim().toLowerCase() !== "completed") return null;
  if (row.category === ACHIEVEMENT) return null;
  const at = Date.parse(String(row.reward_settled_at ?? row.updated_at ?? ""));
  return Number.isFinite(at) ? at : null;
}

/** Distinct UTC days with at least one completed task, oldest first; the «3 дня» task itself does not count. */
export function questDays(rows: QuestCompletionRow[], excludeChallengeId?: string | null): string[] {
  const days = new Set<string>();
  for (const row of rows) {
    if (excludeChallengeId && row.challenge_id === excludeChallengeId) continue;
    const at = completedAt(row);
    if (at === null) continue;
    days.add(new Date(at).toISOString().slice(0, 10));
  }
  return [...days].sort();
}

/** How many of a newcomer's tasks were completed after the helper took «Помоги новичку». */
export function tasksDoneSince(rows: QuestCompletionRow[], takenAt: string | null): number {
  const since = Date.parse(String(takenAt ?? ""));
  if (!Number.isFinite(since)) return 0;
  return rows.filter((row) => {
    const at = completedAt(row);
    return at !== null && at > since;
  }).length;
}
