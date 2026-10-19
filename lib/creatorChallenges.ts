// Pure rules of the "Author from scratch" referral milestones (no imports, tested directly by node).

/** The number of confirmed invited people a "referrals_confirmed_N" check asks for; null for any other check. */
export function confirmedReferralsThreshold(logic: string | null | undefined): number | null {
  const match = logic?.match(/^referrals_confirmed_(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
