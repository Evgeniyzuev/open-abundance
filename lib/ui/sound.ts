const SOUND_STORAGE_KEY = "open-abundance:sounds-enabled";

export type UiSound = "action" | "reward";

export function getSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_STORAGE_KEY) === "true";
}

export function setSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "true" : "false");
}

export function playUiSound(sound: UiSound): void {
  if (!getSoundsEnabled() || typeof window === "undefined") return;
  try {
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(sound === "reward" ? 880 : 520, start);
    if (sound === "reward") oscillator.frequency.exponentialRampToValueAtTime(1320, start + 0.12);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (sound === "reward" ? 0.22 : 0.12));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + (sound === "reward" ? 0.22 : 0.12));
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  } catch {
    // Audio is a best-effort enhancement; visible state remains authoritative.
  }
}
