// One pop-up per person per day across the soft prompts (install the app, turn on reminders), so they never stack.
// Same per-day key idea as the app-open check (GrowthAnalytics); a failing localStorage simply means "do not ask".

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const shownKey = (userId: string) => `openAbundancePromptDay:${userId}`;
const firstSeenKey = (userId: string) => `openAbundanceFirstSeenDay:${userId}`;

export function promptShownToday(userId: string): boolean {
  try {
    return localStorage.getItem(shownKey(userId)) === today();
  } catch {
    return true;
  }
}

export function markPromptShownToday(userId: string): void {
  try {
    localStorage.setItem(shownKey(userId), today());
  } catch {
    // Nothing to record.
  }
}

/** True from the second calendar day the person opens the app: the first visit stays free of system questions. */
export function isAfterFirstDay(userId: string): boolean {
  try {
    const stored = localStorage.getItem(firstSeenKey(userId));
    if (!stored) {
      localStorage.setItem(firstSeenKey(userId), today());
      return false;
    }
    return stored < today();
  } catch {
    return false;
  }
}

export function getPromptCount(name: string, userId: string): number {
  try {
    return Number(localStorage.getItem(`openAbundancePromptCount:${name}:${userId}`) ?? 0) || 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function bumpPromptCount(name: string, userId: string): void {
  try {
    localStorage.setItem(`openAbundancePromptCount:${name}:${userId}`, String(getPromptCount(name, userId) + 1));
  } catch {
    // Nothing to record.
  }
}
