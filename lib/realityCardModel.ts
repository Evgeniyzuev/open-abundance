import type { AppLocale } from "@/lib/locales";
export type CardBlock = { block_key: string; value: unknown };
export type CardText = { kicker: string; headline: string };
export type CardModel = {
  kind: "level_up" | "challenge" | "wish" | "turnover" | "core" | "day";
  level: number | null;
  levelBefore: number | null;
  turnover: number | null;
  coreGrowth: number | null;
  wins: number;
  challengeTitle: string | null;
  wishTitle: string | null;
  tiles: Array<{ key: "level" | "turnover" | "wins" | "core"; value: number }>;
};

const MIN_INTERESTING_CORE = 1;

/**
 * What the day card says: one headline (the most interesting fact of the day) and up to three
 * non-zero numbers that do not repeat the headline. Hidden blocks are simply absent.
 */
export function buildCardModel(blocks: CardBlock[], locale: AppLocale): CardModel {
  const block = (key: string) => blocks.find((item) => item.block_key === key)?.value;
  const level = readNumber(block("level"), "levelAfter");
  const levelBefore = readNumber(block("level"), "levelBefore");
  const turnover = readNumber(block("turnover"), "amount");
  const coreGrowth = readNumber(block("total_core_growth"), "amount");
  const winsValue = block("wins");
  const wins = readNumber(winsValue, "count") ?? 0;
  const challengeTitle = firstTitle(readArray(winsValue, "challenges"), locale);
  const wishTitle = firstTitle(readArray(winsValue, "wishes"), locale);
  const hasWish = readArray(winsValue, "wishes").length > 0;

  const leveledUp = level !== null && levelBefore !== null && level > levelBefore;
  const kind: CardModel["kind"] = leveledUp ? "level_up"
    : challengeTitle ? "challenge"
      : hasWish ? "wish"
        : turnover !== null && turnover > 0 ? "turnover"
          : coreGrowth !== null && coreGrowth >= MIN_INTERESTING_CORE ? "core"
            : "day";

  const tiles: CardModel["tiles"] = [];
  // The level is shown next to the author's name, so it is not repeated as a tile.
  if (turnover !== null && turnover > 0 && kind !== "turnover") tiles.push({ key: "turnover", value: turnover });
  if (wins > 0 && kind !== "challenge" && kind !== "wish") tiles.push({ key: "wins", value: wins });
  else if (wins > 1) tiles.push({ key: "wins", value: wins });
  if (coreGrowth !== null && coreGrowth >= 0.1 && kind !== "core") tiles.push({ key: "core", value: coreGrowth });

  return { kind, level, levelBefore, turnover, coreGrowth, wins, challengeTitle, wishTitle, tiles: tiles.slice(0, 3) };
}

function firstTitle(items: unknown[], locale: AppLocale): string | null {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const title = (item as Record<string, unknown>).title;
    if (typeof title === "string" && title.trim()) return title.trim();
    if (title && typeof title === "object") {
      const localized = (title as Record<string, unknown>)[locale] ?? (title as Record<string, unknown>).en ?? (title as Record<string, unknown>).ru;
      if (typeof localized === "string" && localized.trim()) return localized.trim();
    }
  }
  return null;
}

function readArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const list = (value as Record<string, unknown>)[key];
  return Array.isArray(list) ? list : [];
}

function readNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = Number((value as Record<string, unknown>)[key]);
  return Number.isFinite(parsed) ? parsed : null;
}
