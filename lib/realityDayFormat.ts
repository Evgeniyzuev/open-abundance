import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";

type StatBlockLike = { block_key: string; value: unknown };

export function statBlockLabelKey(blockKey: string): MessageKey {
  if (blockKey === "level") return "social.post.level";
  if (blockKey === "turnover") return "social.post.turnover";
  if (blockKey === "spent") return "social.post.spent";
  if (blockKey === "wins") return "social.post.wins";
  if (blockKey === "total_core_growth") return "social.post.totalCoreGrowth";
  if (blockKey === "team_strength") return "social.post.teamStrength";
  if (blockKey === "core_growth") return "social.post.coreGrowth";
  if (blockKey === "wallet_income") return "social.post.walletIncome";
  if (blockKey === "daily_rate") return "social.post.dailyRate";
  if (blockKey === "reinvest") return "social.post.reinvest";
  return "social.post.detail";
}

export function formatStatBlockValue(block: StatBlockLike, locale: AppLocale): string {
  if (block.block_key === "level") {
    const levelAfter = readValueNumber(block.value, "levelAfter");
    const levelBefore = readValueNumber(block.value, "levelBefore");
    const leveledUp = Boolean(readValue(block.value, "leveledUp"));
    if (!Number.isFinite(levelAfter)) return "Lvl 0";
    return leveledUp && Number.isFinite(levelBefore) ? `Lvl ${levelBefore} → ${levelAfter}` : `Lvl ${levelAfter}`;
  }

  if (block.block_key === "total_core_growth" || block.block_key === "turnover") {
    const amount = readValueNumber(block.value, "amount");
    return `+${formatMoney(Number.isFinite(amount) ? amount : 0, locale)}`;
  }

  if (block.block_key === "spent") {
    const amount = readValueNumber(block.value, "amount");
    const safe = Number.isFinite(amount) ? amount : 0;
    return safe > 0 ? `-${formatMoney(safe, locale)}` : formatMoney(0, locale);
  }

  if (block.block_key === "wins") {
    const count = readValueNumber(block.value, "count");
    return String(Number.isFinite(count) ? count : 0);
  }

  if (block.block_key === "team_strength") {
    const levelSum = readValueNumber(block.value, "levelSum");
    const memberCount = readValueNumber(block.value, "memberCount");
    return `${Number.isFinite(levelSum) ? levelSum : 0} LVL / ${Number.isFinite(memberCount) ? memberCount : 0}`;
  }

  if (block.block_key === "daily_rate" || block.block_key === "reinvest") {
    const percent = readValueNumber(block.value, "percent");
    return Number.isFinite(percent) ? formatPercentValue(percent) : "0%";
  }

  const amount = readValueNumber(block.value, "amount");
  return formatMoney(Number.isFinite(amount) ? amount : 0, locale);
}

export function readValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

export function readValueNumber(value: unknown, key: string): number {
  const parsed = Number(readValue(value, key));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatPercentValue(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}
