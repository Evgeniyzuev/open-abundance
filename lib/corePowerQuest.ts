// "The power of Core" quest (components/QuestScenes.tsx CorePowerQuest): the calculator in Wallet marks the first
// step on this device and tells the quest card, which may be mounted in another tab.

export const CORE_POWER_SEEN_EVENT = "oa:core-power-seen";
export const OPEN_CORE_CALCULATOR_EVENT = "oa:open-core-calculator";

/** The quest's example: $10 of quest rewards a day for 30 years, all income reinvested. */
export const CORE_POWER_EXAMPLE = { dailyAdditions: 10, termYears: 30, reinvestPercent: 100 } as const;

function key(userId: string): string {
  return `oa-core-power-seen:${userId}`;
}

export function markCorePowerSeen(userId: string): void {
  try {
    window.localStorage.setItem(key(userId), new Date().toISOString());
  } catch {
    // The event below still moves the quest on in this session.
  }
  window.dispatchEvent(new CustomEvent(CORE_POWER_SEEN_EVENT));
}

export function corePowerSeen(userId: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(key(userId)));
  } catch {
    return false;
  }
}

export function openCoreCalculatorForQuest(): void {
  window.dispatchEvent(new CustomEvent(OPEN_CORE_CALCULATOR_EVENT, { detail: { ...CORE_POWER_EXAMPLE, fromQuest: true } }));
}
