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

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

// iOS Safari keeps a new AudioContext "suspended" unless it is created or resumed inside a user gesture, and the
// ringer (silent) switch mutes Web Audio. So: one shared context, unlocked on the first touch or click, and the
// "playback" audio session where the browser supports it.
let sharedContext: AudioContext | null = null;
let unlockListenersAdded = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;
  const AudioContextConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  sharedContext = new AudioContextConstructor();
  return sharedContext;
}

function enablePlaybackAudioSession(): void {
  try {
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) session.type = "playback";
  } catch {
    // Unsupported: sounds then follow the device silent switch.
  }
}

function unlockAudio(): void {
  const context = getContext();
  if (!context) return;
  enablePlaybackAudioSession();
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  if (context.state === "running" && unlockListenersAdded) {
    for (const type of GESTURE_EVENTS) window.removeEventListener(type, unlockAudio);
    unlockListenersAdded = false;
  }
}

const GESTURE_EVENTS = ["touchstart", "touchend", "pointerdown", "click", "keydown"] as const;

/** Prepares audio on the first user gesture so later sounds (even after a network call) are audible on iOS. */
export function prepareUiSound(): void {
  if (typeof window === "undefined" || unlockListenersAdded) return;
  unlockListenersAdded = true;
  for (const type of GESTURE_EVENTS) window.addEventListener(type, unlockAudio, { passive: true });
}

if (typeof window !== "undefined") prepareUiSound();

function playTone(context: AudioContext, sound: UiSound): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  const length = sound === "reward" ? 0.3 : 0.18;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(sound === "reward" ? 880 : 520, start);
  if (sound === "reward") oscillator.frequency.exponentialRampToValueAtTime(1320, start + 0.16);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.02);
}

export function playUiSound(sound: UiSound): void {
  if (!getSoundsEnabled() || typeof window === "undefined") return;
  try {
    const context = getContext();
    if (!context) return;
    enablePlaybackAudioSession();
    if (context.state === "running") {
      playTone(context, sound);
      return;
    }
    // Suspended (iOS before the first gesture): resume, then play once the context is running.
    void context.resume().then(() => playTone(context, sound)).catch(() => undefined);
  } catch {
    // Audio is a best-effort enhancement; visible state remains authoritative.
  }
}
