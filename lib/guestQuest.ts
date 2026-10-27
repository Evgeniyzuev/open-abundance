import type { QuestMotive } from "@/lib/questPath";

/**
 * "First step" and "First wish" played by a guest in onboarding, before sign-in. The answers wait on this device and
 * are saved to the new account right after sign-in (components/OnboardingApp.tsx). The rewards are still taken by the
 * person's own tap in the quests: nothing is completed automatically.
 */
export type GuestQuestWish = { key: string; title: string; targetAmount?: number };
export type GuestQuest = { motives?: QuestMotive[]; note?: string; wish?: GuestQuestWish };

const GUEST_QUEST_KEY = "oa.guestQuest";
// Set once the guest answers were saved to the account: the first screen after sign-in is the quests.
const OPEN_QUESTS_KEY = "oa.openQuestsAfterAuth";

export function readGuestQuest(): GuestQuest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_QUEST_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as GuestQuest;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function storeGuestQuest(patch: GuestQuest): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_QUEST_KEY, JSON.stringify({ ...readGuestQuest(), ...patch }));
  } catch {
    // Without storage the guest answers are simply asked again inside the app.
  }
}

export function clearGuestQuest(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_QUEST_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function markOpenQuestsAfterAuth(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OPEN_QUESTS_KEY, "1");
  } catch {
    // The app then opens its usual first screen.
  }
}

/** True once: the caller opens the quests and the mark is gone. */
export function consumeOpenQuestsAfterAuth(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const marked = window.localStorage.getItem(OPEN_QUESTS_KEY) === "1";
    window.localStorage.removeItem(OPEN_QUESTS_KEY);
    return marked;
  } catch {
    return false;
  }
}

export function openQuestsTab(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "challenges");
  url.searchParams.delete("auth");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new CustomEvent("oa:open-tab", { detail: { main: "challenges" } }));
}

/** Saves the guest answers to the signed-in account (proofs only; the person still claims each reward). */
export async function syncGuestQuest(
  guest: GuestQuest,
  authFetch: (input: string, init: RequestInit) => Promise<Response>,
  locale: string
): Promise<{ wish: Record<string, unknown> | null }> {
  let wish: Record<string, unknown> | null = null;
  if (guest.motives?.length) {
    await authFetch("/api/challenges/progress", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationLogic: "first_step_motive", proofKey: "motive_chosen", motives: guest.motives, note: guest.motives.includes("own") ? guest.note : undefined })
    });
  }
  if (guest.wish?.title) {
    // A wish already on the account (signed in on another device first) is not doubled.
    const existing = await authFetch("/api/wishes?status=active&includeRecommended=false", { cache: "no-store" });
    const payload = (await existing.json().catch(() => ({}))) as { wishes?: unknown[] };
    if (!payload.wishes?.length) {
      const response = await authFetch("/api/wishes", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, title: guest.wish.title, ...(guest.wish.targetAmount ? { targetAmount: guest.wish.targetAmount, targetCurrency: "USD" } : {}) })
      });
      const created = (await response.json().catch(() => ({}))) as { wish?: Record<string, unknown> };
      wish = created.wish ?? null;
    }
  }
  return { wish };
}

const INVITED_BY_KEY = "oa.invitedBy";

/** The name of the friend who invited this person, shown over the first quest ("Anna invited you"). */
export function storeInvitedBy(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INVITED_BY_KEY, name.slice(0, 60));
  } catch {
    // The first quest just has no invitation line.
  }
}

export function readInvitedBy(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(INVITED_BY_KEY);
  } catch {
    return null;
  }
}
