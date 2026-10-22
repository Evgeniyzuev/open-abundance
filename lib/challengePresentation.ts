import type { AppLocale } from "@/lib/locales";
export type ChallengeRewardLabel = Record<string, string> | string | number | null;

export function parseChallengeRewardAmount(value: ChallengeRewardLabel, locale: AppLocale): number | null {
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

function localizedRewardLabel(value: ChallengeRewardLabel, locale: AppLocale): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return value?.[locale] ?? value?.en ?? "";
}

export type ChallengeInstructionParts = {
  /** Why the step matters: the opening "Lesson: ..." paragraph, without its label. */
  why: string;
  /** Numbered steps ("1. ...") without their numbers. */
  steps: string[];
  /** Text that is neither the opening paragraph nor a step: shown as a plain note after the steps. */
  note: string;
};

const NUMBERED_STEP = /^\s*\d{1,2}[.)]\s+/;
// A short leading label such as "Урок:", "Lesson:" or "课程：" in front of the opening paragraph.
const LEADING_LABEL = /^\s*[^\s:：.!?]{1,14}\s*[:：]\s*/u;

/** Splits the stored instructions text into the card blocks "Why", "Steps" and a trailing note. */
export function splitChallengeInstructions(text: string): ChallengeInstructionParts {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstStep = lines.findIndex((line) => NUMBERED_STEP.test(line));

  // Older cards have no numbered steps: keep their text as it is.
  if (firstStep === -1) return { why: "", steps: [], note: lines.join("\n") };

  const rest = lines.slice(firstStep);
  const stepCount = rest.findIndex((line) => !NUMBERED_STEP.test(line));
  const steps = (stepCount === -1 ? rest : rest.slice(0, stepCount)).map((line) => line.replace(NUMBERED_STEP, ""));
  const after = stepCount === -1 ? [] : rest.slice(stepCount);

  const why = lines.slice(0, firstStep).join("\n").replace(LEADING_LABEL, "");
  return {
    why: why.charAt(0).toLocaleUpperCase() + why.slice(1),
    steps,
    note: after.join("\n")
  };
}
