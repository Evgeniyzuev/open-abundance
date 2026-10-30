// Daily chests (Duolingo-style «bonus for tomorrow», migration 20261030130000, no imports, tested by node):
//   after the first tasks a closed chest appears; a key comes once a UTC day when the Core earned by actions that day
//   reaches keyAt; the key opens one chest whose day has come; at nextChestAt a new closed chest appears for tomorrow.

export type ChestOdds = Array<{ amount: number; weight: number }>;
export type ChestSettings = { firstChestAfterTasks: number; keyAt: number; nextChestAt: number; odds: ChestOdds };
export type DailyChest = {
  id: string;
  kind: "first" | "tomorrow";
  earnedOn: string;
  opensOn: string;
  status: "locked" | "opened";
  rewardCoreAmount: number | null;
  openedOn: string | null;
};
export type ChestState = {
  today: string;
  earnedToday: number;
  keyAt: number;
  nextChestAt: number;
  /** A key is in hand: today's threshold is reached and no chest was opened today. */
  hasKey: boolean;
  keyUsedToday: boolean;
  /** The chest the key opens now, or the one waiting for a key or for tomorrow. */
  chest: DailyChest | null;
  openable: DailyChest | null;
  tomorrowChestEarned: boolean;
  completedTasks: number;
  firstChestAfterTasks: number;
  odds: Array<{ amount: number; percent: number }>;
  expectedAmount: number;
};

export const CHEST_DEFAULTS: ChestSettings = {
  firstChestAfterTasks: 2,
  keyAt: 5,
  nextChestAt: 8,
  odds: [
    { amount: 0.3, weight: 60 },
    { amount: 0.5, weight: 30 },
    { amount: 1, weight: 9 },
    { amount: 5, weight: 1 }
  ]
};

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nextUtcDay(day: string): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000));
}

/** Chances in whole percents and the expected amount, shown openly under the chest. */
export function chestOddsSummary(odds: ChestOdds): { odds: Array<{ amount: number; percent: number }>; expectedAmount: number } {
  const clean = odds.filter((item) => Number.isFinite(item.amount) && Number.isFinite(item.weight) && item.weight > 0);
  const total = clean.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return { odds: [], expectedAmount: 0 };
  return {
    odds: clean.map((item) => ({ amount: item.amount, percent: Math.round((item.weight / total) * 1000) / 10 })),
    expectedAmount: Math.round((clean.reduce((sum, item) => sum + item.amount * item.weight, 0) / total) * 100) / 100
  };
}

/** Oldest locked chest whose day has come (the key opens it), else the oldest locked one. */
export function pickChests(chests: DailyChest[], today: string): { chest: DailyChest | null; openable: DailyChest | null } {
  const locked = chests.filter((chest) => chest.status === "locked").sort((a, b) => a.opensOn.localeCompare(b.opensOn));
  const ready = locked.find((chest) => chest.opensOn <= today) ?? null;
  return { chest: ready ?? locked[0] ?? null, openable: ready };
}

export function chestState(input: {
  chests: DailyChest[];
  completedTasks: number;
  earnedToday: number;
  now: Date;
  settings: ChestSettings;
}): ChestState {
  const today = utcDay(input.now);
  const keyUsedToday = input.chests.some((chest) => chest.openedOn === today);
  const hasKey = input.earnedToday >= input.settings.keyAt && !keyUsedToday;
  const { chest, openable } = pickChests(input.chests, today);
  const summary = chestOddsSummary(input.settings.odds);
  return {
    today,
    earnedToday: Math.round(input.earnedToday * 100) / 100,
    keyAt: input.settings.keyAt,
    nextChestAt: input.settings.nextChestAt,
    hasKey,
    keyUsedToday,
    chest,
    openable: hasKey ? openable : null,
    tomorrowChestEarned: input.chests.some((item) => item.kind === "tomorrow" && item.earnedOn === today),
    completedTasks: input.completedTasks,
    firstChestAfterTasks: input.settings.firstChestAfterTasks,
    odds: summary.odds,
    expectedAmount: summary.expectedAmount
  };
}

/** Which chests the server should add now: the first one after the first tasks, tomorrow's one at nextChestAt. */
export function chestsToGrant(input: { chests: DailyChest[]; completedTasks: number; earnedToday: number; now: Date; settings: ChestSettings }) {
  const today = utcDay(input.now);
  const grants: Array<{ kind: DailyChest["kind"]; earnedOn: string; opensOn: string }> = [];
  if (!input.chests.some((chest) => chest.kind === "first") && input.completedTasks >= input.settings.firstChestAfterTasks) {
    grants.push({ kind: "first", earnedOn: today, opensOn: today });
  }
  if (input.earnedToday >= input.settings.nextChestAt && !input.chests.some((chest) => chest.kind === "tomorrow" && chest.earnedOn === today)) {
    grants.push({ kind: "tomorrow", earnedOn: today, opensOn: nextUtcDay(today) });
  }
  return grants;
}

/** Marks on the day bar: where the key and tomorrow's chest sit, and how far today's Core has come (0..1). */
export function chestBar(earnedToday: number, keyAt: number, nextChestAt: number) {
  const max = Math.max(nextChestAt, keyAt, 0.01);
  return {
    fill: Math.min(Math.max(earnedToday / max, 0), 1),
    keyMark: keyAt / max,
    keyReached: earnedToday >= keyAt,
    chestReached: earnedToday >= nextChestAt,
    toKey: Math.max(Math.round((keyAt - earnedToday) * 100) / 100, 0),
    toChest: Math.max(Math.round((nextChestAt - earnedToday) * 100) / 100, 0)
  };
}
