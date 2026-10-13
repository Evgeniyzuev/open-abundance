/**
 * Shared contract for AI-suggested task steps. Steps are plain subtask strings
 * once accepted; minutes are only a preview hint and are never stored.
 */

export const MAX_SUGGESTED_STEPS = 7;
export const MAX_STEP_LENGTH = 140;
export const MAX_TASK_SUBTASKS = 20;

export type TaskStepSuggestion = {
  text: string;
  minutes: number;
};

export type TaskStepsRequest = {
  title: string;
  description?: string;
  existingSteps?: string[];
  locale?: string;
};

export type TaskStepsResponse = {
  steps: TaskStepSuggestion[];
};

/** Keeps only usable, non-duplicate steps and clamps their length and time hint. */
export function normalizeStepSuggestions(value: unknown, existingSteps: string[] = []): TaskStepSuggestion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(existingSteps.map(stepKey));
  const steps: TaskStepSuggestion[] = [];
  for (const item of value) {
    const raw = typeof item === "string" ? { text: item } : (item as { text?: unknown; minutes?: unknown } | null);
    const text = typeof raw?.text === "string" ? raw.text.replace(/\s+/g, " ").trim().slice(0, MAX_STEP_LENGTH) : "";
    if (!text || seen.has(stepKey(text))) continue;
    seen.add(stepKey(text));
    const minutes = Math.round(Number((raw as { minutes?: unknown }).minutes));
    steps.push({ text, minutes: Number.isFinite(minutes) ? Math.min(Math.max(minutes, 1), 240) : 10 });
    if (steps.length >= MAX_SUGGESTED_STEPS) break;
  }
  return steps;
}

export function isTaskStepsResponse(value: unknown): value is TaskStepsResponse {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as TaskStepsResponse).steps);
}

function stepKey(text: string): string {
  return text.trim().toLowerCase();
}
