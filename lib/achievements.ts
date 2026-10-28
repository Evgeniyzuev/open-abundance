// Achievements: milestone chains for comments, posts and reactions (Evgen, 2026-10-28). Each milestone is a row in
// `challenges` (category "achievement", verification_logic "achievement:<series>:<threshold>") so the reward goes
// through the same settle_user_challenge_rewards as quests; the Quests list does not show them. The first comment
// and the first post are ordinary path quests; the chains start at 5. No project imports, so node tests it directly.

export const ACHIEVEMENT_CATEGORY = "achievement";

export type AchievementSeries = "comments" | "posts" | "reactions_given" | "reactions_received";

export const ACHIEVEMENT_SERIES: AchievementSeries[] = ["comments", "posts", "reactions_received", "reactions_given"];

/** Thresholds per series. Comments and posts start after their first-step quests. */
export const ACHIEVEMENT_THRESHOLDS: Record<AchievementSeries, number[]> = {
  comments: [5, 10, 20, 50, 100, 200, 500, 1000],
  posts: [5, 10, 20, 50, 100, 200, 500, 1000],
  reactions_given: [1, 5, 10, 20, 50, 100, 200, 500, 1000],
  reactions_received: [1, 5, 10, 20, 50, 100, 200, 500, 1000]
};

/** Rewards per milestone: a comment $0.1 + $0.01, a post $0.5 + $0.05, reactions ten times less than a comment. */
export const ACHIEVEMENT_REWARDS: Record<AchievementSeries, { core: number; wallet: number }> = {
  comments: { core: 0.1, wallet: 0.01 },
  posts: { core: 0.5, wallet: 0.05 },
  // Wallet keeps two decimals, so the tenth of a cent is not paid there.
  reactions_given: { core: 0.01, wallet: 0 },
  reactions_received: { core: 0.01, wallet: 0 }
};

/** The quests for the first comment and the first post (on the growth path, before the chains). */
export const FIRST_COMMENT_LOGIC = "first_comment_posted";
export const FIRST_POST_LOGIC = "first_post_published";

/** A comment counts from this many characters ("ок" and "+" do not). */
export const COUNTED_COMMENT_MIN_LENGTH = 10;
/** Automatic progress posts are not counted as the person's posts. */
export const UNCOUNTED_POST_TYPES = ["daily_progress", "level_up"];

export function achievementLogic(series: AchievementSeries, threshold: number): string {
  return `achievement:${series}:${threshold}`;
}

export function parseAchievementLogic(logic: string | null | undefined): { series: AchievementSeries; threshold: number } | null {
  const match = /^achievement:(comments|posts|reactions_given|reactions_received):(\d+)$/.exec(logic ?? "");
  if (!match) return null;
  const series = match[1] as AchievementSeries;
  const threshold = Number(match[2]);
  return ACHIEVEMENT_THRESHOLDS[series].includes(threshold) ? { series, threshold } : null;
}

export type AchievementCounts = Record<AchievementSeries, number>;

export type AchievementState = {
  series: AchievementSeries;
  threshold: number;
  challengeId: string;
  reward: { core: number; wallet: number };
  status: "claimed" | "ready" | "locked";
  claimedAt: string | null;
};

/** Every milestone with its state: claimed, ready to claim (the count reached it), or still ahead. */
export function achievementStates(
  rows: { id: string; verification_logic: string | null; core_reward_amount: number; wallet_reward_amount: number }[],
  counts: AchievementCounts,
  claimed: Map<string, string | null>
): AchievementState[] {
  const states: AchievementState[] = [];
  for (const row of rows) {
    const parsed = parseAchievementLogic(row.verification_logic);
    if (!parsed) continue;
    const isClaimed = claimed.has(row.id);
    states.push({
      ...parsed,
      challengeId: row.id,
      reward: { core: Number(row.core_reward_amount), wallet: Number(row.wallet_reward_amount) },
      status: isClaimed ? "claimed" : counts[parsed.series] >= parsed.threshold ? "ready" : "locked",
      claimedAt: isClaimed ? claimed.get(row.id) ?? null : null
    });
  }
  return states.sort((a, b) => ACHIEVEMENT_SERIES.indexOf(a.series) - ACHIEVEMENT_SERIES.indexOf(b.series) || a.threshold - b.threshold);
}
