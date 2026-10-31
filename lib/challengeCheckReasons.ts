// Why a challenge check did not pass, as a stable code the client translates.
// The check route keeps its detailed English reasons; the code lets every language show a clear message and the next step.
export const CHALLENGE_CHECK_REASON_CODES = ["not_done_yet", "not_accepted", "awaiting_review", "account_missing", "not_connected", "check_failed", "wrong_code", "focus_days", "newcomer_none", "newcomer_waiting"] as const;

export type ChallengeCheckReasonCode = (typeof CHALLENGE_CHECK_REASON_CODES)[number];

export function classifyChallengeCheckReason(reason: string): ChallengeCheckReasonCode {
  if (/^Could not (check|read)\b/i.test(reason)) return "check_failed";
  if (/is not created yet/i.test(reason)) return "account_missing";
  if (/not connected/i.test(reason)) return "not_connected";
  if (/manual review|confirmation from another participant/i.test(reason)) return "awaiting_review";
  if (/^Accept the challenge/i.test(reason)) return "not_accepted";
  if (/^Enter the code/i.test(reason)) return "wrong_code";
  return "not_done_yet";
}
