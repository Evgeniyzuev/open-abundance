/** Shared contract for "help me choose": two to four options in, one recommendation out. */

export const MIN_DECISION_OPTIONS = 2;
export const MAX_DECISION_OPTIONS = 4;
export const MAX_DECISION_OPTION_LENGTH = 140;
export const MAX_DECISION_CONTEXT_LENGTH = 300;

export type DecisionResult = {
  choice: number;
  reason: string;
  firstStep: string;
};

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

export function cleanDecisionOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: string[] = [];
  for (const entry of value) {
    const text = clean(entry, MAX_DECISION_OPTION_LENGTH);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    options.push(text);
    if (options.length >= MAX_DECISION_OPTIONS) break;
  }
  return options;
}

/** Returns null unless the model chose one real option and gave a reason. */
export function normalizeDecision(value: unknown, optionCount: number): DecisionResult | null {
  const raw = value as { choice?: unknown; reason?: unknown; firstStep?: unknown } | null;
  const choice = typeof raw?.choice === "number" ? Math.round(raw.choice) : Number.NaN;
  const reason = clean(raw?.reason, 240);
  if (!Number.isInteger(choice) || choice < 0 || choice >= optionCount || !reason) return null;
  return { choice, reason, firstStep: clean(raw?.firstStep, 140) };
}

export function isDecisionResult(value: unknown): value is DecisionResult {
  const raw = value as DecisionResult | null;
  return Boolean(raw) && typeof raw?.choice === "number" && typeof raw?.reason === "string";
}
