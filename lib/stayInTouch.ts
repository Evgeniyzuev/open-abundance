/**
 * «Будем на связи» (path step 3, verification_logic app_installed): three steps, each can be skipped. Each step done
 * the first time earns a third of the task's Core reward ($0.3 of $0.9), paid together when the person claims at the
 * end. The task can be taken again later: it then shows only the steps not rewarded yet. Settled in SQL by
 * settle_stay_in_touch (migration 20261029160000) from the steps app/api/challenges/check verified on the server.
 */
export const STAY_STEPS = ["bot", "app", "push"] as const;
export type StayStep = (typeof STAY_STEPS)[number];

export function isStayStep(value: unknown): value is StayStep {
  return typeof value === "string" && (STAY_STEPS as readonly string[]).includes(value);
}

/** Steps already rewarded, from user_challenges.verification_data.stay_rewarded_steps. */
export function stayRewardedSteps(verificationData: unknown): StayStep[] {
  const raw = verificationData && typeof verificationData === "object" ? (verificationData as Record<string, unknown>).stay_rewarded_steps : null;
  return Array.isArray(raw) ? STAY_STEPS.filter((step) => raw.includes(step)) : [];
}

export function stayStepReward(coreRewardAmount: number): number {
  return Math.round((Number(coreRewardAmount) / STAY_STEPS.length) * 100) / 100;
}
