export type RealityDayTurnover = {
  total: number;
  sales: number;
  people: number;
  rewards: number;
  deposits: number;
  core: number;
  other: number;
  uniquePayers: number;
};

export type RealityDaySpent = {
  total: number;
  purchases: number;
  people: number;
  cashOut: number;
  core: number;
  other: number;
};

export type RealityDayWin = { id: string; title: unknown };

export type RealityDaySummary = {
  date: string;
  turnover: RealityDayTurnover;
  spent: RealityDaySpent;
  wins: { challenges: RealityDayWin[]; wishes: RealityDayWin[] };
};

// Order of the day's blocks in the post and in the "My day" preview.
export const REALITY_BLOCK_KEYS = ["level", "turnover", "spent", "wins", "total_core_growth", "team_strength"] as const;
export type RealityBlockKey = (typeof REALITY_BLOCK_KEYS)[number];

export function isRealityBlockKey(value: unknown): value is RealityBlockKey {
  return typeof value === "string" && (REALITY_BLOCK_KEYS as readonly string[]).includes(value);
}

export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function parseRealityDaySummary(value: unknown, date: string): RealityDaySummary {
  const root = asRecord(value);
  const turnover = asRecord(root.turnover);
  const spent = asRecord(root.spent);
  const wins = asRecord(root.wins);
  return {
    date: typeof root.date === "string" ? root.date : date,
    turnover: {
      total: num(turnover.total),
      sales: num(turnover.sales),
      people: num(turnover.people),
      rewards: num(turnover.rewards),
      deposits: num(turnover.deposits),
      core: num(turnover.core),
      other: num(turnover.other),
      uniquePayers: num(turnover.uniquePayers)
    },
    spent: {
      total: num(spent.total),
      purchases: num(spent.purchases),
      people: num(spent.people),
      cashOut: num(spent.cashOut),
      core: num(spent.core),
      other: num(spent.other)
    },
    wins: {
      challenges: readWins(wins.challenges),
      wishes: readWins(wins.wishes)
    }
  };
}

export function realityDayHasActivity(summary: RealityDaySummary): boolean {
  return summary.turnover.total > 0
    || summary.spent.total > 0
    || summary.wins.challenges.length > 0
    || summary.wins.wishes.length > 0;
}

export function realityWinsCount(summary: Pick<RealityDaySummary, "wins">): number {
  return summary.wins.challenges.length + summary.wins.wishes.length;
}

function readWins(value: unknown): RealityDayWin[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item) => typeof item.id === "string")
    .map((item) => ({ id: item.id as string, title: item.title ?? null }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
