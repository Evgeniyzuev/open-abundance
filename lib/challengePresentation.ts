export type ChallengeRewardLabel = Record<string, string> | string | number | null;

type ChallengeRewardSource = {
  core_reward_amount?: number | null;
  wallet_reward_amount?: number | null;
  reward_amount?: number | null;
  reward_account?: string | null;
  reward_label?: ChallengeRewardLabel;
};

export function resolveChallengeRewardAmounts(source: ChallengeRewardSource, locale: "ru" | "en"): { core_reward_amount: number; wallet_reward_amount: number } {
  if (source.core_reward_amount != null && source.wallet_reward_amount != null) {
    return {
      core_reward_amount: source.core_reward_amount,
      wallet_reward_amount: source.wallet_reward_amount
    };
  }

  // Older API processes still return the pre-migration fields during a rolling update.
  const legacyAmount = source.reward_amount ?? parseChallengeRewardAmount(source.reward_label ?? null, locale) ?? 0;
  return source.reward_account === "wallet"
    ? { core_reward_amount: 0, wallet_reward_amount: legacyAmount }
    : { core_reward_amount: legacyAmount, wallet_reward_amount: 0 };
}

export function parseChallengeRewardAmount(value: ChallengeRewardLabel, locale: "ru" | "en"): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = localizedRewardLabel(value, locale).trim();
  if (!raw) return null;

  const match = raw.match(/(?:\$\s*|\+\s*)(\d[\d\s,]*(?:\.\d+)?)/)
    ?? raw.match(/(\d[\d\s,]*(?:\.\d+)?)\s*\$/)
    ?? raw.match(/(\d[\d\s,]*(?:\.\d+)?)/);
  if (!match) return null;

  const compact = match[1].replace(/\s/g, "");
  const commaCount = (compact.match(/,/g) ?? []).length;
  const normalized = commaCount > 1 || /,\d{3}$/.test(compact)
    ? compact.replace(/,/g, "")
    : compact.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function localizedRewardLabel(value: ChallengeRewardLabel, locale: "ru" | "en"): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return value?.[locale] ?? value?.en ?? "";
}
