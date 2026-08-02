export type SkillVerificationLogic =
  | "referral_count"
  | "public_post_count"
  | "team_member_count"
  | "team_contact_count"
  | "challenge_completion_count";

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
};

export type SkillAutoCheck = {
  level: number;
  verificationLogic: SkillVerificationLogic;
  threshold: number;
  currentValue: number;
  requirements: string;
  passed: boolean;
};

export type PassportSkill = SkillCatalogItem & {
  earnedLevel: number;
  effectiveLevel: number;
  status: "unverified" | "verified";
  lastCheckedAt: string | null;
  checks: SkillAutoCheck[];
};

export type SkillPassportPayload = {
  coreLevel: number;
  skills: PassportSkill[];
  checkedAt: string | null;
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
