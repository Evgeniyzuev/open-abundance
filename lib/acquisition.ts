export type AcquisitionContext = {
  source: string;
  medium?: string;
  campaign?: string;
  cohortId?: string;
};

const STORAGE_KEY = "openAbundanceAcquisitionContext";

export function captureAcquisitionContext(): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const source = cleanValue(params.get("utm_source")) ?? (cleanValue(params.get("ref")) ? "referral" : null);
  const medium = cleanValue(params.get("utm_medium"));
  const campaign = cleanValue(params.get("utm_campaign"));
  const cohortId = cleanValue(params.get("cohort"));

  if (!source && !medium && !campaign && !cohortId) return;

  try {
    const existing = readAcquisitionContext();
    const next: AcquisitionContext = {
      source: existing?.source ?? source ?? "direct",
      medium: existing?.medium ?? medium,
      campaign: existing?.campaign ?? campaign,
      cohortId: existing?.cohortId ?? cohortId
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Attribution is best-effort and must never block onboarding.
  }
}

export function readAcquisitionContext(): AcquisitionContext {
  if (typeof window === "undefined") return { source: "direct" };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { source: "direct" };
    const value = JSON.parse(raw) as Partial<AcquisitionContext>;
    return {
      source: cleanValue(value.source) ?? "direct",
      medium: cleanValue(value.medium),
      campaign: cleanValue(value.campaign),
      cohortId: cleanValue(value.cohortId)
    };
  } catch {
    return { source: "direct" };
  }
}

function cleanValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 100) : undefined;
}
