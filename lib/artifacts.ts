// The catalog of achievement artifacts and the rules that open them (no imports, tested directly by node).
// An artifact is a remembered, confirmed fact, not an item: it cannot be bought or sold. The server decides
// what is unlocked from facts it already stores; the device only remembers which ones it has announced.

export type ArtifactKey = "first_light" | "wish_path" | "today_done" | "seven_day_rhythm" | "first_story" | "help_someone" | "skill_evidence" | "level_up";

export type ArtifactDefinition = {
  key: ArtifactKey;
  image: string;
  /** Challenge checks (verification_logic) whose completion opens it. */
  logics: string[];
};

export const ARTIFACTS: ArtifactDefinition[] = [
  { key: "first_light", image: "/milestones/first-light.webp", logics: [] },
  { key: "wish_path", image: "/milestones/wish-path.webp", logics: ["wish_steps_created"] },
  { key: "today_done", image: "/milestones/today-done.webp", logics: ["today_core_target_reached"] },
  { key: "seven_day_rhythm", image: "/milestones/seven-day-rhythm.webp", logics: ["today_completion_streak_7"] },
  { key: "first_story", image: "/milestones/first-story.webp", logics: ["first_growth_post_published"] },
  { key: "help_someone", image: "/milestones/help-someone.webp", logics: ["trust_event_confirmed:help_given", "team_task_help_completed"] },
  { key: "skill_evidence", image: "/milestones/skill-evidence.webp", logics: ["skill_profile_completed"] },
  { key: "level_up", image: "/milestones/level-up.webp", logics: [] }
];

/** The level-up dialog already announces new levels, so this artifact is never announced a second time. */
export const SILENT_ARTIFACTS: ArtifactKey[] = ["level_up"];

export type CompletedChallenge = { logic: string | null; at: string };
export type UnlockedArtifact = { key: ArtifactKey; at: string | null };

/** Which artifacts the confirmed facts open, with the date of the earliest fact that opened each. */
export function computeUnlocked(input: { completed: CompletedChallenge[]; level: number; wishStepsAt: string | null }): UnlockedArtifact[] {
  const earliest = (rows: CompletedChallenge[]) => rows.map((row) => row.at).filter(Boolean).sort()[0] ?? null;
  const unlocked: UnlockedArtifact[] = [];

  for (const artifact of ARTIFACTS) {
    if (artifact.key === "first_light") {
      if (input.completed.length > 0) unlocked.push({ key: artifact.key, at: earliest(input.completed) });
    } else if (artifact.key === "wish_path") {
      const challengeAt = earliest(input.completed.filter((row) => row.logic === "wish_steps_created"));
      const at = [challengeAt, input.wishStepsAt].filter(Boolean).sort()[0] ?? null;
      if (input.wishStepsAt || challengeAt) unlocked.push({ key: artifact.key, at });
    } else if (artifact.key === "level_up") {
      if (input.level >= 1) unlocked.push({ key: artifact.key, at: null });
    } else {
      const matching = input.completed.filter((row) => row.logic && artifact.logics.includes(row.logic));
      if (matching.length > 0) unlocked.push({ key: artifact.key, at: earliest(matching) });
    }
  }
  return unlocked;
}

/**
 * What to announce now. Without a record on this device the current artifacts are taken as already known (an
 * existing person is not flooded with old awards); from then on only new ones are announced, one at a time.
 */
export function pickToAnnounce(unlockedKeys: ArtifactKey[], seen: string[] | null): { announce: ArtifactKey[]; nextSeen: string[] } {
  if (seen === null) return { announce: [], nextSeen: unlockedKeys };
  const known = new Set(seen);
  const fresh = unlockedKeys.filter((key) => !known.has(key));
  return { announce: fresh.filter((key) => !SILENT_ARTIFACTS.includes(key)), nextSeen: [...new Set([...seen, ...unlockedKeys])] };
}
