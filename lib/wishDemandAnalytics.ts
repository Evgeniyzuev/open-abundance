// Which wishes come up most often and which are easiest to fulfil now (daily analytics, section 4).
// Privacy: titles leave the database only when they are system text (small wish catalog, recommended
// wishes) or a public wish; a private wish of one's own is counted under its category.
import { levelForCore, wishLevelForPrice } from "./wishPrice.ts";
import { matchSmallWish } from "./smallWishes.ts";

type Row = Record<string, any>;

export type WishDemandRow = {
  label: string;
  kind: "small_help" | "small_habit" | "small_money" | "recommended" | "public" | "own_category";
  people: number;
  medianPrice: number | null;
  level: number;
  /** Owners who can start it now: free wishes, or Core level at or above the wish level. */
  readyNow: number;
  completed: number;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function buildWishDemand(input: {
  wishes: Row[];
  recommendedTitles: Map<string, string>;
  balances: Map<string, number>;
}): WishDemandRow[] {
  const groups = new Map<string, { label: string; kind: WishDemandRow["kind"]; owners: Set<string>; prices: number[]; readyOwners: Set<string>; completed: number }>();
  for (const wish of input.wishes) {
    if (wish.deleted_at || !wish.owner_user_id) continue;
    const small = matchSmallWish(wish.title);
    let key: string;
    let label: string;
    let kind: WishDemandRow["kind"];
    if (small) {
      key = `small:${small.key}`;
      label = small.title.ru;
      kind = `small_${small.kind}` as WishDemandRow["kind"];
    } else if (wish.source_recommended_wish_id && input.recommendedTitles.has(wish.source_recommended_wish_id)) {
      key = `rec:${wish.source_recommended_wish_id}`;
      label = input.recommendedTitles.get(wish.source_recommended_wish_id) ?? "рекомендованное";
      kind = "recommended";
    } else if (wish.visibility === "public") {
      label = String(wish.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      key = `pub:${label.toLowerCase()}`;
      kind = "public";
    } else {
      label = `свои: ${wish.category || "без категории"}`;
      key = `own:${label}`;
      kind = "own_category";
    }
    const group = groups.get(key) ?? { label, kind, owners: new Set<string>(), prices: [], readyOwners: new Set<string>(), completed: 0 };
    group.owners.add(wish.owner_user_id);
    const price = Number(wish.target_amount) || 0;
    if (price > 0) group.prices.push(price);
    const ownerLevel = levelForCore(input.balances.get(wish.owner_user_id) ?? 0);
    if (price <= 0 || ownerLevel >= wishLevelForPrice(price)) group.readyOwners.add(wish.owner_user_id);
    if (wish.status === "completed") group.completed += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const medianPrice = median(group.prices);
    return {
      label: group.label,
      kind: group.kind,
      people: group.owners.size,
      medianPrice,
      level: wishLevelForPrice(medianPrice),
      readyNow: group.readyOwners.size,
      completed: group.completed
    };
  });
}

/** Easiest to start fulfilling: most people who can start now, then most people overall. */
export function rankWishDemand(rows: WishDemandRow[]): WishDemandRow[] {
  return [...rows].sort((left, right) => right.readyNow - left.readyNow || right.people - left.people || left.label.localeCompare(right.label));
}

export const WISH_KIND_LABEL: Record<WishDemandRow["kind"], string> = {
  small_help: "маленькое: помощь людей",
  small_habit: "маленькое: привычка",
  small_money: "маленькое: сумма",
  recommended: "рекомендованное",
  public: "публичное",
  own_category: "свои (по категории)"
};
