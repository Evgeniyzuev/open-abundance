export type DailyUnreadState = {
  dateKey: string;
  challengesViewed: boolean;
  todayViewed: boolean;
};

const STORAGE_PREFIX = "openAbundanceDailyUnread";

export function getLocalDateKey(timeZone = getBrowserTimeZone()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function readDailyUnreadState(userId: string | null | undefined): DailyUnreadState {
  const dateKey = getLocalDateKey();
  const fallback = { dateKey, challengesViewed: false, todayViewed: false };
  if (!userId || typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(storageKey(userId, dateKey));
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<DailyUnreadState>;
    return {
      dateKey,
      challengesViewed: value.challengesViewed === true,
      todayViewed: value.todayViewed === true
    };
  } catch {
    return fallback;
  }
}

export function markChallengesViewed(userId: string | null | undefined): void {
  markViewed(userId, "challengesViewed");
}

export function markTodayViewed(userId: string | null | undefined): void {
  markViewed(userId, "todayViewed");
}

function markViewed(userId: string | null | undefined, field: "challengesViewed" | "todayViewed"): void {
  if (!userId || typeof window === "undefined") return;
  const current = readDailyUnreadState(userId);
  if (current[field]) return;

  try {
    window.localStorage.setItem(
      storageKey(userId, current.dateKey),
      JSON.stringify({ ...current, [field]: true })
    );
  } catch {
    // The indicator remains session-local when browser storage is unavailable.
  }
}

function storageKey(userId: string, dateKey: string): string {
  return `${STORAGE_PREFIX}:${userId}:${dateKey}`;
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
