export const SOFTWARE_CREATION_SLUG = "software_creation" as const;

export type SkillSubmissionStatus = "draft" | "in_review" | "rework" | "accepted";
export type SkillReviewStatus = "open" | "assigned" | "decided" | "superseded";
export type SkillReviewVerdict = "pass" | "rework";

export type LocalizedText = {
  en?: string;
  ru?: string;
  [key: string]: string | undefined;
};

export type SkillCatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  learningPath: string[];
  available: boolean;
};

export type SkillLevelRule = {
  level: number;
  requirements: string;
  rubric: Array<{ key: string; label: string }>;
};

export type SkillEvidence = {
  id: string;
  version: number;
  deliverableTitle: string;
  deliverableDescription: string;
  acceptanceCriteria: string;
  repoUrl: string;
  proofUrl: string;
  testScenario: string;
  limitations: string;
  contentHash: string;
  createdAt: string;
};

export type SkillReviewDecision = {
  id: string;
  requestId: string;
  reviewerUserId: string;
  verdict: SkillReviewVerdict;
  reproducibility: boolean;
  criteriaMet: boolean;
  proofSufficient: boolean;
  safety: boolean;
  criticalIssue: boolean;
  recommendation: string;
  comment: string;
  createdAt: string;
};

export type SkillReviewRequest = {
  id: string;
  slotNo: number;
  status: SkillReviewStatus;
  reviewerUserId: string | null;
  claimedAt: string | null;
  decidedAt: string | null;
  evidence: SkillEvidence | null;
  decision: SkillReviewDecision | null;
  ownerName?: string;
  skillTitle?: string;
  targetLevel?: number;
  canClaim?: boolean;
};

export type SkillSubmission = {
  id: string;
  targetLevel: number;
  status: SkillSubmissionStatus;
  attempt: number;
  latestEvidenceVersion: number;
  reworkReason: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  evidence: SkillEvidence | null;
  reviewRequests: SkillReviewRequest[];
};

export type PassportSkill = SkillCatalogItem & {
  earnedLevel: number;
  effectiveLevel: number;
  status: "unverified" | "verified";
  rule: SkillLevelRule | null;
  submission: SkillSubmission | null;
};

export type SkillPassportPayload = {
  coreLevel: number;
  skills: PassportSkill[];
  reviewQueue: SkillReviewRequest[];
  reviewerBootstrapEnabled: boolean;
  error?: string;
};

export function localizedText(value: unknown, locale: "ru" | "en"): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const record = value as LocalizedText;
  return record[locale] ?? record.en ?? record.ru ?? "";
}

export function localizedList(value: unknown, locale: "ru" | "en"): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => localizedText(item, locale))
    .filter(Boolean);
}

