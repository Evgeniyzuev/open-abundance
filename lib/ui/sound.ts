const SOUND_STORAGE_KEY = "open-abundance:sounds-enabled";

export type UiSound = "action" | "correct" | "wrong" | "reward" | "levelUp" | "chestTick" | "chestOpen";

/** Sounds are on unless the person turned them off (Duolingo-style; founder decision 2026-10-30). */
export function getSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return !soundsMuted();
}

function soundsMuted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "false";
  } catch {
    return false;
  }
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

function note(context: AudioContext, frequency: number, at: number, length: number, volume: number, type: OscillatorType): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

// Short, soft synth phrases (no audio files): a pop for actions, a bright two-note "ding" for a right answer, a low
// soft "hm" for a miss (never harsh), a fanfare for a reward, a longer climb for a new level.
function playTone(context: AudioContext, sound: UiSound): void {
  const now = context.currentTime;
  switch (sound) {
    case "chestTick":
      note(context, 180, now, 0.09, 0.22, "triangle");
      return;
    case "chestOpen":
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => note(context, frequency, now + index * 0.09, 0.42, 0.22, "triangle"));
      [1568, 2093, 2637].forEach((frequency, index) => note(context, frequency, now + 0.4 + index * 0.07, 0.3, 0.08, "sine"));
      return;
    case "correct":
      note(context, 987.77, now, 0.16, 0.2, "triangle");
      note(context, 1318.51, now + 0.09, 0.32, 0.2, "triangle");
      return;
    case "wrong":
      note(context, 311.13, now, 0.16, 0.16, "sine");
      note(context, 261.63, now + 0.12, 0.26, 0.14, "sine");
      return;
    case "reward":
      [659.25, 830.61, 987.77].forEach((frequency, index) => note(context, frequency, now + index * 0.08, 0.3, 0.2, "triangle"));
      note(context, 1318.51, now + 0.26, 0.5, 0.18, "triangle");
      note(context, 2637, now + 0.32, 0.25, 0.05, "sine");
      return;
    case "levelUp":
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, index) => note(context, frequency, now + index * 0.1, 0.36, 0.2, "triangle"));
      [1046.5, 1318.51, 1567.98].forEach((frequency) => note(context, frequency, now + 0.55, 0.8, 0.12, "triangle"));
      return;
    default:
      note(context, 660, now, 0.07, 0.18, "sine");
      note(context, 880, now + 0.05, 0.1, 0.14, "sine");
  }
}

const VIBRATION: Partial<Record<UiSound, number | number[]>> = {
  action: 8,
  correct: 15,
  wrong: [30, 40, 30],
  reward: [20, 30, 40],
  levelUp: [30, 40, 30, 40, 60],
  chestOpen: [30, 40, 60]
};

function vibrate(sound: UiSound): void {
  try {
    const pattern = VIBRATION[sound];
    if (pattern !== undefined && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // Not every browser lets a page vibrate (iPhone never does).
  }
}

/** `unlessMuted`: plays unless the person turned sounds off (chest opening), not only when they turned them on. */
export function playUiSound(sound: UiSound, options: { unlessMuted?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  if (options.unlessMuted ? soundsMuted() : !getSoundsEnabled()) return;
  vibrate(sound);
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
