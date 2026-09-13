/** Only server-confirmed eligibility is used; a wish does not imply a challenge match. */
export type JourneyChallenge = {
  id: string;
  title: Record<string, string>;
  difficulty_level: number;
  sort_order: number;
  prerequisite_challenge_id?: string | null;
  prerequisite_completed?: boolean;
  user_challenge_status?: string | null;
  is_permanent?: boolean;
};

export function selectJourneyChallenge(challenges: JourneyChallenge[], level: number): JourneyChallenge | null {
  const eligible = challenges.filter((challenge) =>
    challenge.user_challenge_status !== "completed"
    && challenge.difficulty_level <= level
    && challenge.prerequisite_completed !== false
    && (!challenge.prerequisite_challenge_id || challenge.prerequisite_completed === true)
  );
  return [...eligible].sort((a, b) =>
    Number(b.user_challenge_status === "accepted") - Number(a.user_challenge_status === "accepted")
    || a.sort_order - b.sort_order
    || a.id.localeCompare(b.id)
  )[0] ?? null;
}
