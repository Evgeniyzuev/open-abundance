// Pure rules of the daily economy report (no imports, tested directly by node).
// It answers four founder questions from rows the app already stores: how much was paid out in rewards, what a newly
// attracted person costs, how many active people could earn a meaningful amount today, and whether the sales that pay
// rewards look like real trade or like a circle of friends. It reads facts and never changes anything.

export type Completion = { userId: string; challengeId: string; core: number; wallet: number; at: string };
export type ChallengeInfo = { id: string; title: string; logic: string | null };
export type DealRow = { sellerId: string; buyerId: string; price: number; at: string };
export type EdgeRow = { referrerId: string; referralId: string; at: string };
export type ActivityRow = { userId: string; at: string };

export type EconomyInput = {
  completions: Completion[];
  challenges: ChallengeInfo[];
  registrations: string[];
  referrals: EdgeRow[];
  activity: ActivityRow[];
  deals: DealRow[];
};

/** Challenges whose reward pays for bringing a real person (they make up the cost of attraction). */
export const ATTRACTION_LOGICS = ["referral_program", "has_referral", "humanity_confirmed", "team_contact_active"];

export type WindowReport = {
  days: number;
  rewardsCore: number;
  rewardsWallet: number;
  rewardsTotal: number;
  completions: number;
  activeUsers: number;
  newUsers: number;
  newReferred: number;
  attractionRewards: number;
  /** Rewards paid for attraction per newly referred person, null when nobody new came by invitation. */
  costPerReferred: number | null;
  /** All rewards per new registration, null when nobody registered. */
  rewardPerNewUser: number | null;
  /** Rewards per active person. */
  rewardPerActiveUser: number | null;
  /** Share of active people who were paid at least $1 and at least $10 in the window (1 day: the "$10 a day" goal). */
  earnedAtLeast1: number | null;
  earnedAtLeast10: number | null;
  top: Array<{ title: string; count: number; total: number }>;
};

export type DealFlag = { kind: "repeat_pair" | "reciprocal" | "referral_link"; sellerId: string; buyerId: string; deals: number; total: number };

export type EconomyReport = {
  generatedAt: string;
  day: WindowReport;
  week: WindowReport;
  suspiciousSales: DealFlag[];
  salesChecked: number;
};

const DAY_MS = 86_400_000;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inWindow(at: string, from: number, to: number): boolean {
  const time = Date.parse(at);
  return Number.isFinite(time) && time >= from && time < to;
}

export function windowReport(input: EconomyInput, days: number, now: number): WindowReport {
  const from = now - days * DAY_MS;
  const info = new Map(input.challenges.map((challenge) => [challenge.id, challenge]));
  const paid = input.completions.filter((row) => inWindow(row.at, from, now + 1));
  const rewardsCore = paid.reduce((sum, row) => sum + row.core, 0);
  const rewardsWallet = paid.reduce((sum, row) => sum + row.wallet, 0);
  const rewardsTotal = rewardsCore + rewardsWallet;

  const attractionRewards = paid
    .filter((row) => ATTRACTION_LOGICS.includes(info.get(row.challengeId)?.logic ?? ""))
    .reduce((sum, row) => sum + row.core + row.wallet, 0);
  const active = new Set(input.activity.filter((row) => inWindow(row.at, from, now + 1)).map((row) => row.userId));
  const newUsers = input.registrations.filter((at) => inWindow(at, from, now + 1)).length;
  const newReferred = input.referrals.filter((row) => inWindow(row.at, from, now + 1)).length;

  const perUser = new Map<string, number>();
  for (const row of paid) perUser.set(row.userId, (perUser.get(row.userId) ?? 0) + row.core + row.wallet);
  const activeCount = active.size;
  const earned = (limit: number) => (activeCount > 0 ? round([...active].filter((id) => (perUser.get(id) ?? 0) >= limit).length / activeCount, 3) : null);

  const byChallenge = new Map<string, { title: string; count: number; total: number }>();
  for (const row of paid) {
    const entry = byChallenge.get(row.challengeId) ?? { title: info.get(row.challengeId)?.title ?? row.challengeId.slice(0, 8), count: 0, total: 0 };
    entry.count += 1;
    entry.total += row.core + row.wallet;
    byChallenge.set(row.challengeId, entry);
  }

  return {
    days,
    rewardsCore: round(rewardsCore),
    rewardsWallet: round(rewardsWallet),
    rewardsTotal: round(rewardsTotal),
    completions: paid.length,
    activeUsers: activeCount,
    newUsers,
    newReferred,
    attractionRewards: round(attractionRewards),
    costPerReferred: newReferred > 0 ? round(attractionRewards / newReferred) : null,
    rewardPerNewUser: newUsers > 0 ? round(rewardsTotal / newUsers) : null,
    rewardPerActiveUser: activeCount > 0 ? round(rewardsTotal / activeCount) : null,
    earnedAtLeast1: earned(1),
    earnedAtLeast10: earned(10),
    top: [...byChallenge.values()].sort((a, b) => b.total - a.total).slice(0, 5).map((entry) => ({ ...entry, total: round(entry.total) }))
  };
}

/**
 * Sales that may be a circle rather than trade, from completed deals in the window: the same pair trading three or
 * more times, two people selling to each other, or a seller and a buyer joined by an invitation. These are leads for a
 * human to look at, never a verdict and never an automatic action.
 */
export function flagSales(deals: DealRow[], edges: EdgeRow[], repeatThreshold = 3): DealFlag[] {
  const pair = (a: string, b: string) => `${a}>${b}`;
  const groups = new Map<string, { sellerId: string; buyerId: string; deals: number; total: number }>();
  for (const deal of deals) {
    if (!deal.sellerId || !deal.buyerId) continue;
    const key = pair(deal.sellerId, deal.buyerId);
    const entry = groups.get(key) ?? { sellerId: deal.sellerId, buyerId: deal.buyerId, deals: 0, total: 0 };
    entry.deals += 1;
    entry.total += deal.price;
    groups.set(key, entry);
  }
  const linked = new Set(edges.flatMap((edge) => [pair(edge.referrerId, edge.referralId), pair(edge.referralId, edge.referrerId)]));
  const flags: DealFlag[] = [];
  for (const entry of groups.values()) {
    const total = round(entry.total);
    if (entry.deals >= repeatThreshold) flags.push({ kind: "repeat_pair", ...entry, total });
    else if (groups.has(pair(entry.buyerId, entry.sellerId))) flags.push({ kind: "reciprocal", ...entry, total });
    else if (linked.has(pair(entry.sellerId, entry.buyerId))) flags.push({ kind: "referral_link", ...entry, total });
  }
  return flags.sort((a, b) => b.total - a.total);
}

export function buildEconomyReport(input: EconomyInput, now: number, edgesForSales: EdgeRow[] = input.referrals): EconomyReport {
  const weekFrom = now - 7 * DAY_MS;
  const weekDeals = input.deals.filter((deal) => inWindow(deal.at, weekFrom, now + 1));
  return {
    generatedAt: new Date(now).toISOString(),
    day: windowReport(input, 1, now),
    week: windowReport(input, 7, now),
    suspiciousSales: flagSales(weekDeals, edgesForSales),
    salesChecked: weekDeals.length
  };
}
