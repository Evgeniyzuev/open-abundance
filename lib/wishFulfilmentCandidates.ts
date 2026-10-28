// Daily wish proposals (Evgen, 2026-10-28): which wishes to fulfil next, for the daily analytics and the daily
// procedure. Small wishes first: help from people and habits for anyone active, small sums (up to $30) only for
// people who already contributed ("I'm not a robot" passed and quests done), as the small-wishes plan says.
// Privacy: a title is shown only when it is catalog text or a public wish; a private wish shows its category.
import { matchSmallWish } from "./smallWishes.ts";

type Row = Record<string, any>;

export const MONEY_WISH_MAX = 30;
const DAY_MS = 86_400_000;

export type WishCandidate = {
  userId: string;
  wishId: string;
  label: string;
  kind: "help" | "habit" | "money" | "free";
  price: number;
  questsDone: number;
  notRobot: boolean;
  daysSinceActive: number | null;
  score: number;
  action: string;
};

const ACTION: Record<WishCandidate["kind"], string> = {
  help: "попросить сообщество: пост в ленте и 1–2 помощника, Нова пишет владельцу",
  habit: "Нова ведёт привычку 14–30 дней, отметки на встречах с лидом",
  money: "выплата из фонда желаний после проверки вклада, потом публичный пост «исполнено»",
  free: "Нова спрашивает владельца, какой маленький шаг к желанию сделать вместе (название подставляется при отправке, в отчёт не попадает)"
};

export function buildWishCandidates(input: {
  wishes: Row[];
  userChallenges: Row[];
  humanity: Map<string, number>;
  lastActive: Map<string, number>;
  excluded?: (userId: string) => boolean;
  now: number;
}): WishCandidate[] {
  const questsDone = new Map<string, number>();
  for (const row of input.userChallenges) if (row.status === "completed") questsDone.set(row.user_id, (questsDone.get(row.user_id) ?? 0) + 1);

  const best = new Map<string, WishCandidate>();
  for (const wish of input.wishes) {
    const userId = wish.owner_user_id;
    if (!userId || wish.deleted_at || wish.status === "completed" || input.excluded?.(userId)) continue;
    const price = Number(wish.target_amount) || 0;
    const small = matchSmallWish(wish.title);
    const kind: WishCandidate["kind"] = small ? small.kind : price > 0 ? "money" : "free";
    if (kind === "money" && price > MONEY_WISH_MAX) continue;

    const quests = questsDone.get(userId) ?? 0;
    const notRobot = (input.humanity.get(userId) ?? 0) >= 2;
    const last = input.lastActive.get(userId);
    const daysSinceActive = last ? Math.floor((input.now - last) / DAY_MS) : null;
    // Money only after contribution; everyone else must have been here in the last week.
    if (kind === "money" && (!notRobot || quests < 3)) continue;
    if (daysSinceActive === null || daysSinceActive > 7) continue;

    const label = small ? small.title.ru : wish.visibility === "public" ? String(wish.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : `своё желание (${wish.category || "без категории"})`;
    const score = Math.min(quests, 10) + (notRobot ? 3 : 0) + (daysSinceActive <= 2 ? 2 : 0) + (small ? 2 : 0) - price / 15;
    const candidate: WishCandidate = { userId, wishId: wish.id, label, kind, price, questsDone: quests, notRobot, daysSinceActive, score, action: ACTION[kind] };
    const current = best.get(userId);
    if (!current || candidate.score > current.score) best.set(userId, candidate);
  }
  return [...best.values()].sort((left, right) => right.score - left.score);
}

/** Up to `limit` proposals with at most one per kind first, so the day has a mix of help, habit and money. */
export function pickWishProposals(candidates: WishCandidate[], limit = 3): WishCandidate[] {
  const picked: WishCandidate[] = [];
  const kinds = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    if (kinds.has(candidate.kind)) continue;
    picked.push(candidate);
    kinds.add(candidate.kind);
  }
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}
