// Where the Core balance came from: top-ups, the daily % income kept in Core, and rewards for actions.
// The parts are sums of the same sources the Core history shows; whatever the history cannot attribute
// (older settlements without a row) is counted as "other rewards", so the parts always add up to the balance.

export type CoreSourceKey = "topup" | "purchases" | "income" | "actions";
export type CoreActionKey = "challenges" | "reviews" | "referrals" | "team" | "other";

export type CoreSourceTotals = {
  topup: number;
  /** Garden items (their whole price) and the Core share of shop purchases. */
  purchases: number;
  income: number;
  challenges: number;
  reviews: number;
  referrals: number;
  team: number;
};

export type CoreSourcePart<K extends string> = { key: K; amount: number; percent: number };

export type CoreSourcesSummary = {
  balance: number;
  parts: CoreSourcePart<CoreSourceKey>[];
  actions: CoreSourcePart<CoreActionKey>[];
};

const CENT = 0.01;

function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function percentOf(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 1000) / 10 : 0;
}

export function summarizeCoreSources(balance: number, totals: CoreSourceTotals): CoreSourcesSummary {
  const topup = clean(totals.topup);
  const purchases = clean(totals.purchases);
  const income = clean(totals.income);
  const known = {
    challenges: clean(totals.challenges),
    reviews: clean(totals.reviews),
    referrals: clean(totals.referrals),
    team: clean(totals.team)
  };
  const attributed = topup + purchases + income + known.challenges + known.reviews + known.referrals + known.team;
  const safeBalance = clean(balance);
  const otherRaw = safeBalance - attributed;
  const other = otherRaw >= CENT ? otherRaw : 0;
  const total = attributed + other;
  const actionsAmount = known.challenges + known.reviews + known.referrals + known.team + other;

  const parts: CoreSourcePart<CoreSourceKey>[] = [
    { key: "topup" as const, amount: topup },
    { key: "purchases" as const, amount: purchases },
    { key: "income" as const, amount: income },
    { key: "actions" as const, amount: actionsAmount }
  ].map((part) => ({ ...part, percent: percentOf(part.amount, total) }));

  const actions: CoreSourcePart<CoreActionKey>[] = [
    { key: "challenges" as const, amount: known.challenges },
    { key: "reviews" as const, amount: known.reviews },
    { key: "referrals" as const, amount: known.referrals },
    { key: "team" as const, amount: known.team },
    { key: "other" as const, amount: other }
  ]
    .filter((part) => part.amount >= CENT)
    .map((part) => ({ ...part, percent: percentOf(part.amount, total) }));

  return { balance: safeBalance, parts, actions };
}
