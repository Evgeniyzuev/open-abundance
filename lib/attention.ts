// Attention settings kept on this device (no imports, tested directly by node).
// Applied as data attributes on <html>; layout.tsx applies them before first paint.

export const FOCUS_MODE_STORAGE_KEY = "open-abundance:focus-mode";
export const REDUCED_MOTION_STORAGE_KEY = "open-abundance:reduce-motion";

export type AttentionSettings = { focusMode: boolean; reducedMotion: boolean };

export function readAttentionSettings(): AttentionSettings {
  try {
    return {
      focusMode: window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === "on",
      reducedMotion: window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY) === "on"
    };
  } catch {
    return { focusMode: false, reducedMotion: false };
  }
}

export function applyAttentionSettings(settings: AttentionSettings, root: { dataset: Record<string, string | undefined> } = document.documentElement): void {
  if (settings.focusMode) root.dataset.focusMode = "on";
  else delete root.dataset.focusMode;
  if (settings.reducedMotion) root.dataset.motion = "reduced";
  else delete root.dataset.motion;
}

export function storeAttentionSettings(settings: AttentionSettings): void {
  try {
    window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, settings.focusMode ? "on" : "off");
    window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, settings.reducedMotion ? "on" : "off");
  } catch {
    // The setting still applies for this visit.
  }
  applyAttentionSettings(settings);
}

/** True when either the system or the in-app setting asks for less motion. */
export function prefersLessMotion(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.dataset.motion === "reduced" || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}
