export type ChallengeRewardLabel = Record<string, string> | string | number | null;

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
