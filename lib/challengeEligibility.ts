export type ChallengeAccessReason = "core_level" | "first_result" | "prerequisite";

export type ChallengeEligibilityRecord = {
  id?: string;
  difficulty_level: number;
  verification_logic?: string | null;
  prerequisite_challenge_id?: string | null;
  prerequisite_completed?: boolean;
  user_challenge_status?: string | null;
};

export function getChallengeAccessReasons(challenge: ChallengeEligibilityRecord, userLevel: number): ChallengeAccessReason[] {
  const reasons: ChallengeAccessReason[] = [];

  if (challenge.difficulty_level > userLevel) reasons.push("core_level");
  if (challenge.prerequisite_completed === false) {
    reasons.push(challenge.verification_logic === "has_referral" ? "first_result" : "prerequisite");
  }

  return reasons;
}

export function canAcceptChallenge(challenge: ChallengeEligibilityRecord, userLevel: number): boolean {
  return getChallengeAccessReasons(challenge, userLevel).length === 0;
}

export function isActiveChallengeStatus(status?: string | null): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "accepted" || normalized === "failed";
}

export function isCompletedChallengeStatus(status?: string | null): boolean {
  return String(status ?? "").trim().toLowerCase() === "completed";
}

export function isChallengeAlmostAvailable(challenge: ChallengeEligibilityRecord, userLevel: number, allChallenges: ChallengeEligibilityRecord[]): boolean {
  const reasons = getChallengeAccessReasons(challenge, userLevel);
  if (reasons.length !== 1) return false;
  if (reasons[0] === "core_level") return challenge.difficulty_level === userLevel + 1;
  if (reasons[0] !== "prerequisite") return true;

  if (!challenge.prerequisite_challenge_id) return false;
  const prerequisite = allChallenges.find((candidate) => candidate.id === challenge.prerequisite_challenge_id);
  if (!prerequisite) return false;

  return isActiveChallengeStatus(prerequisite.user_challenge_status)
    || (!prerequisite.user_challenge_status && getChallengeAccessReasons(prerequisite, userLevel).length === 0);
}

export function isNonOnboardingChallenge(category?: string | null): boolean {
  return Boolean(category && category.trim().toLowerCase() !== "onboarding");
}

export type ChallengeResultSnapshot = { challenge_category?: string | null };
export type ChallengeProgressWithCategory = {
  status?: string | null;
  challenges?: { category?: string | null } | { category?: string | null }[] | null;
};

export function hasFirstResult(
  snapshots: ChallengeResultSnapshot[] = [],
  progressRows: ChallengeProgressWithCategory[] = []
): boolean {
  if (snapshots.some((snapshot) => isNonOnboardingChallenge(snapshot.challenge_category))) return true;

  return progressRows.some((row) => {
    if (String(row.status ?? "").trim().toLowerCase() !== "completed") return false;
    const related = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
    return isNonOnboardingChallenge(related?.category);
  });
}
