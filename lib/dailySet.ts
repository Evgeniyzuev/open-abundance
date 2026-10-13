// Pure helpers for the finite "daily set" on Home (no imports, tested directly by node).
// A set has an end: a few cards, one action each, then a summary. Nothing is fetched for it.

export const ADVENTURE_COUNT = 12;
export const QUESTION_COUNT = 10;
export const DAILY_SET_STORAGE_KEY = "open-abundance:daily-set:v1";

export type DailySetCardKind = "task" | "adventure" | "challenge" | "question" | "stories";

export type DailySetState = {
  day: string;
  index: number;
  actions: number;
  skips: number;
  /** Kinds already acted on today, so a card is never counted twice. */
  acted: DailySetCardKind[];
  /** Card order fixed at the first step, so progress never jumps when data changes. */
  cards: DailySetCardKind[];
};

const CARD_KINDS: DailySetCardKind[] = ["task", "adventure", "challenge", "question", "stories"];

/** Card order for today; cards without data are left out so the set never shows an empty card. */
export function buildDailySet(input: { hasTask: boolean; hasChallenge: boolean }): DailySetCardKind[] {
  const cards: DailySetCardKind[] = [];
  if (input.hasTask) cards.push("task");
  cards.push("adventure");
  if (input.hasChallenge) cards.push("challenge");
  cards.push("question", "stories");
  return cards;
}

/** Stable pick per local day, so the same day shows the same adventure and question. */
export function pickDailyIndex(day: string, count: number, salt = 0): number {
  let hash = salt;
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % count) + 1;
}

export function freshDailySetState(day: string): DailySetState {
  return { day, index: 0, actions: 0, skips: 0, acted: [], cards: [] };
}

/** Restores today's progress; anything from another day or malformed starts a new set. */
export function restoreDailySetState(raw: unknown, day: string): DailySetState {
  const value = raw as Partial<DailySetState> | null;
  if (!value || value.day !== day || typeof value.index !== "number" || value.index < 0) return freshDailySetState(day);
  return {
    day,
    index: Math.floor(value.index),
    actions: Math.max(0, Math.floor(Number(value.actions) || 0)),
    skips: Math.max(0, Math.floor(Number(value.skips) || 0)),
    acted: Array.isArray(value.acted) ? value.acted.filter((kind): kind is DailySetCardKind => CARD_KINDS.includes(kind)) : [],
    cards: Array.isArray(value.cards) ? value.cards.filter((kind): kind is DailySetCardKind => CARD_KINDS.includes(kind)) : []
  };
}

/** Today's cards: the locked order once started, otherwise the order built from current data. */
export function activeDailySetCards(state: DailySetState, built: DailySetCardKind[]): DailySetCardKind[] {
  return state.cards.length > 0 ? state.cards : built;
}

export function recordDailySetStep(state: DailySetState, kind: DailySetCardKind, outcome: "action" | "skip", cards: DailySetCardKind[] = state.cards): DailySetState {
  const locked = state.cards.length > 0 ? state.cards : cards;
  if (outcome === "skip") return { ...state, cards: locked, index: state.index + 1, skips: state.skips + 1 };
  const counted = state.acted.includes(kind);
  return {
    ...state,
    cards: locked,
    index: state.index + 1,
    actions: counted ? state.actions : state.actions + 1,
    acted: counted ? state.acted : [...state.acted, kind]
  };
}

export function isDailySetFinished(state: DailySetState, cards: DailySetCardKind[]): boolean {
  return state.index >= cards.length;
}
