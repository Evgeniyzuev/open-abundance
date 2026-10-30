const SOUND_STORAGE_KEY = "open-abundance:sounds-enabled";

export type UiSound = "action" | "reward" | "chestTick" | "chestOpen";

export function getSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_STORAGE_KEY) === "true";
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

function playTone(context: AudioContext, sound: UiSound): void {
  const now = context.currentTime;
  if (sound === "chestTick") {
    // A soft wooden knock while the chest shakes.
    note(context, 180, now, 0.09, 0.22, "triangle");
    return;
  }
  if (sound === "chestOpen") {
    // A rising major arpeggio with a high sparkle on top: the chest opens.
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => note(context, frequency, now + index * 0.09, 0.42, 0.22, "triangle"));
    [1568, 2093, 2637].forEach((frequency, index) => note(context, frequency, now + 0.4 + index * 0.07, 0.3, 0.08, "sine"));
    return;
  }
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

/** `unlessMuted`: plays unless the person turned sounds off (chest opening), not only when they turned them on. */
export function playUiSound(sound: UiSound, options: { unlessMuted?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  if (options.unlessMuted ? soundsMuted() : !getSoundsEnabled()) return;
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
