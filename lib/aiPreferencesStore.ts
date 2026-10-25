"use client";

import { addFeedbackEntry, buildPreferenceKeys, type AiFeedbackEntry, type AiPreferenceKey } from "@/lib/aiPreferences";

const STORAGE_KEY = "openAbundanceAiFeedback";
export const AI_PREFERENCES_CHANGED_EVENT = "oa:ai-preferences-changed";

export function readAiFeedback(): AiFeedbackEntry[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value as AiFeedbackEntry[] : [];
  } catch {
    return [];
  }
}

function writeAiFeedback(entries: AiFeedbackEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Without storage the ratings simply are not remembered.
  }
  window.dispatchEvent(new Event(AI_PREFERENCES_CHANGED_EVENT));
}

export function recordAiFeedback(entry: AiFeedbackEntry) {
  writeAiFeedback(addFeedbackEntry(readAiFeedback(), entry));
}

export function removeAiFeedback(ref: string) {
  writeAiFeedback(readAiFeedback().filter((entry) => entry.ref !== ref));
}

export function resetAiFeedback() {
  writeAiFeedback([]);
}

/** The instructions that go with the next AI answer. */
export function currentAiPreferenceKeys(): AiPreferenceKey[] {
  if (typeof window === "undefined") return [];
  return buildPreferenceKeys(readAiFeedback());
}
