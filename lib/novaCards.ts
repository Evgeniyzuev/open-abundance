// Pure rules for Nova's daily card on the Today screen (no imports, tested directly by node).
// At most one card a day, in the app only, dismissible; three dismissals in a row pause cards for a week.

export type NovaCardKind = "start" | "week" | "return" | "level" | "step";

export type NovaCardInput = {
  /** Days since the account was created, or null when unknown. */
  ageDays: number | null;
  /** Whole days since the last visit, or null on the first visit on this device. */
  daysSinceVisit: number | null;
  hasWish: boolean;
  /** Wallet has money that could go to Core and a next level exists. */
  canTopUpToNextLevel: boolean;
  /** A weekly summary is ready and has not been shown yet. */
  hasWeeklySummary: boolean;
};

export type NovaCardState = {
  day: string;
  kind: NovaCardKind;
  dismissed: boolean;
  acted: boolean;
  streak: number;
  pausedUntil?: string;
};

export const NOVA_CARD_PAUSE_DAYS = 7;
export const NOVA_CARD_MAX_DISMISSALS = 3;

/** Highest priority first: a newcomer, the weekly summary, a person coming back, a concrete Core step, then a gentle question. */
export function pickNovaCard(input: NovaCardInput): NovaCardKind | null {
  if (input.ageDays !== null && input.ageDays <= 2) return "start";
  if (input.hasWeeklySummary) return "week";
  if (input.daysSinceVisit !== null && input.daysSinceVisit >= 3) return "return";
  if (input.canTopUpToNextLevel) return "level";
  if (input.hasWish) return "step";
  return null;
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

export type NovaCardDecision = { show: NovaCardKind | null; state: NovaCardState | null };

/** Decides what to show today and the state to store. `candidate` is pickNovaCard() for today. */
export function decideNovaCard(previous: NovaCardState | null, today: string, candidate: NovaCardKind | null): NovaCardDecision {
  if (previous?.pausedUntil && today < previous.pausedUntil) return { show: null, state: previous };
  if (previous && previous.day === today) {
    return { show: previous.dismissed || previous.acted ? null : previous.kind, state: previous };
  }
  if (!candidate) return { show: null, state: previous };
  // A card that was closed without being used counts towards the pause; using one resets it.
  const streak = previous && previous.dismissed && !previous.acted ? previous.streak + 1 : 0;
  if (streak >= NOVA_CARD_MAX_DISMISSALS) {
    return { show: null, state: { day: today, kind: candidate, dismissed: true, acted: false, streak: 0, pausedUntil: addDays(today, NOVA_CARD_PAUSE_DAYS) } };
  }
  return { show: candidate, state: { day: today, kind: candidate, dismissed: false, acted: false, streak } };
}
