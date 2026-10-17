import { personLabel } from "@/lib/personName";
import { DAILY_CORE_RATE, calculateFutureCore, findDaysToTarget, formatDurationParts, normalizePercent } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney, formatRateMoney } from "@/lib/moneyFormat";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { HALF_YEAR_DAYS, COMPARISON_BASE_INDEX, BENCHMARKS, type CoreHistoryRow, type WalletHistoryRow, type TermUnit, type TFunction, type ComparisonPoint, type ComparisonSeries, type WalletTransferContact, type WalletRecipient, type MarketplaceListing, type MarketplaceResponse, type MarketplaceListingInput, type MarketplaceDeal } from "@/components/wallet/walletTypes";

export async function loadCoreHistory(locale: AppLocale): Promise<CoreHistoryRow[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/core/history?limit=50&locale=${locale}&ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: CoreHistoryRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load core history.");
  return payload.rows ?? [];
}

export function formatHistoryDay(value: string, locale: AppLocale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function coreHistoryLabel(row: CoreHistoryRow, locale: AppLocale, t: TFunction): string {
  if (row.kind === "daily_accrual") return t("wallet.history.coreDailyAccrual");
  if (row.kind === "challenge_reward") return localizedHistoryTitle(row.challenge_title, locale) ?? t("wallet.history.challengeReward");
  if (row.kind === "peer_review_reward") return t("wallet.history.peerReviewReward");
  if (row.kind === "wallet_core_topup") {
    if (row.metadata?.afterburn) return t("wallet.history.afterburn");
    if (row.metadata?.core_item) return t("wallet.history.coreItem");
    return t("wallet.history.walletCoreTopup");
  }
  if (row.kind === "referral_reward") return t("wallet.history.referralReward");
  return t("wallet.history.teamBonus");
}

/** Second line of a Core history row: the balance after the operation, when it can be trusted. */
export function coreHistoryDetail(row: CoreHistoryRow, locale: AppLocale, t: TFunction): string {
  return historyBalanceText(row.balance_after, locale, t);
}

export function historyBalanceText(balance: number | null | undefined, locale: AppLocale, t: TFunction): string {
  return typeof balance === "number" && Number.isFinite(balance) ? `${t("wallet.history.balance")}: ${formatAdaptiveMoney(balance, locale)}` : "";
}

export function localizedHistoryTitle(value: unknown, locale: AppLocale): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const localized = record[locale] ?? record.en ?? record.ru;
  return typeof localized === "string" ? localized : undefined;
}

export async function loadWalletHistory(): Promise<WalletHistoryRow[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/wallet/history?limit=30&ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: WalletHistoryRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load wallet history.");
  return payload.rows ?? [];
}

export async function loadWalletTransferContacts(): Promise<WalletTransferContact[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/social/contacts?ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = (await response.json()) as { contacts?: WalletTransferContact[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load contacts.");
  return payload.contacts ?? [];
}

export async function loadWalletRecipient(userId: string): Promise<WalletRecipient> {
  const token = await getAccessToken();
  const response = await fetch(`/api/wallet/recipients/${userId}?ts=${Date.now()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = (await response.json()) as { recipient?: WalletRecipient; error?: string };
  if (!response.ok || payload.error || !payload.recipient) throw new Error(payload.error ?? "Recipient profile not found.");
  return payload.recipient;
}

export async function loadMarketplaceData(): Promise<Required<Pick<MarketplaceResponse, "listingLimit" | "listings" | "openListingCount" | "sellableArtifacts">>> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings?ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as MarketplaceResponse;
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load marketplace.");
  return {
    listingLimit: payload.listingLimit ?? 1,
    listings: payload.listings ?? [],
    openListingCount: payload.openListingCount ?? 0,
    sellableArtifacts: payload.sellableArtifacts ?? []
  };
}

export async function loadMarketplaceDeals(): Promise<MarketplaceDeal[]> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/deals?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json()) as { deals?: MarketplaceDeal[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load marketplace deals.");
  return payload.deals ?? [];
}

export async function loadMarketplaceListing(listingId: string): Promise<MarketplaceListing> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings/${listingId}?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json()) as { listing?: MarketplaceListing; error?: string };
  if (!response.ok || payload.error || !payload.listing) throw new Error(payload.error ?? "Failed to load listing details.");
  return payload.listing;
}

export async function updateMarketplaceListing(listingId: string, input: MarketplaceListingInput): Promise<MarketplaceListing> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings/${listingId}`, {
    method: "PATCH",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const payload = (await response.json()) as { listing?: MarketplaceListing; error?: string };
  if (!response.ok || payload.error || !payload.listing) throw new Error(payload.error ?? "Failed to update listing.");
  return payload.listing;
}

export async function createMarketplaceDeal(listingId: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch("/api/marketplace/deals", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId, idempotencyKey: crypto.randomUUID() })
  });
  const payload = (await response.json()) as { deal?: MarketplaceDeal; error?: string };
  if (!response.ok || payload.error || !payload.deal) throw new Error(payload.error ?? "Failed to create marketplace deal.");
}

export async function marketplaceDealAction(dealId: string, action: "accept" | "cancel" | "deliver" | "confirm" | "dispute" | "review", reason?: string, review?: { rating: number; reviewText: string }): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/deals/${dealId}/${action}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(action === "review" ? { rating: review?.rating, reviewText: review?.reviewText } : reason ? { reason } : {})
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to update marketplace deal.");
}

export async function createMarketplaceListing(input: MarketplaceListingInput): Promise<MarketplaceListing> {
  const token = await getAccessToken();
  const response = await fetch("/api/marketplace/listings", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(input)
  });
  const payload = (await response.json()) as { error?: string; listing?: MarketplaceListing };
  if (!response.ok || payload.error || !payload.listing) throw new Error(payload.error ?? "Failed to create marketplace listing.");
  return payload.listing;
}

export async function cancelMarketplaceListing(listingId: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`/api/marketplace/listings/${listingId}/cancel`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to cancel marketplace listing.");
}

export async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

export function buildComparisonSeries({
  locale,
  reinvestPercent,
  days
}: {
  locale: AppLocale;
  reinvestPercent: number;
  days: number;
}): ComparisonSeries[] {
  const cleanDays = Math.max(0, Number.isFinite(days) ? days : 0);
  const cleanReinvestPercent = normalizePercent(reinvestPercent);
  const pointDays = buildComparisonDays(cleanDays);
  const corePoints = pointDays.map((pointDay) => {
    const amount = calculateFutureCore({
      startCore: COMPARISON_BASE_INDEX,
      dailyAdditions: 0,
      reinvestPercent: cleanReinvestPercent,
      days: pointDay
    });
    return { days: pointDay, value: amount };
  });

  const coreAnnualReturn = Math.pow(1 + (DAILY_CORE_RATE * (cleanReinvestPercent / 100)), 365.25) - 1;

  return [
    {
      id: "core",
      label: "Core",
      color: "#0a84ff",
      points: corePoints,
      finalIndex: corePoints.at(-1)?.value ?? COMPARISON_BASE_INDEX,
      annualReturn: coreAnnualReturn
    },
    ...BENCHMARKS.map((benchmark) => {
      const points = pointDays.map((pointDay) => ({
        days: pointDay,
        value: COMPARISON_BASE_INDEX * Math.pow(1 + benchmark.annualReturn, pointDay / 365.25)
      }));

      return {
        id: benchmark.id,
        label: benchmark.label[locale],
        color: benchmark.color,
        points,
        finalIndex: points.at(-1)?.value ?? COMPARISON_BASE_INDEX,
        annualReturn: benchmark.annualReturn
      };
    })
  ];
}

export function buildComparisonDays(days: number): number[] {
  if (days <= 0) return [0];

  const pointDays = [0];
  for (let pointDay = HALF_YEAR_DAYS; pointDay < days; pointDay += HALF_YEAR_DAYS) {
    pointDays.push(pointDay);
  }
  pointDays.push(days);
  return pointDays;
}

export function linePath(points: ComparisonPoint[], totalDays: number, yMax: number, plot: { left: number; top: number; width: number; height: number }): string {
  return points
    .map((point, index) => {
      const x = xForDay(point.days, totalDays, plot);
      const y = yForValue(point.value, yMax, plot);
      return `${index === 0 ? "M" : "L"} ${roundSvg(x)} ${roundSvg(y)}`;
    })
    .join(" ");
}

export function xForDay(days: number, totalDays: number, plot: { left: number; width: number }): number {
  if (totalDays <= 0) return plot.left;
  return plot.left + (clamp(days / totalDays, 0, 1) * plot.width);
}

export function yForValue(value: number, yMax: number, plot: { top: number; height: number }): number {
  return plot.top + ((1 - clamp(value / yMax, 0, 1)) * plot.height);
}

export function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatIndexTick(value: number, locale: AppLocale): string {
  return formatCompactNumber(value, locale, 0);
}

export function formatIndexValue(value: number, locale: AppLocale): string {
  return `x${formatCompactNumber(value / COMPARISON_BASE_INDEX, locale, 2)}`;
}

export function formatAnnualReturn(value: number, locale: AppLocale, t: TFunction): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(value * 100)}%/${t("wallet.calculator.perYear")}`;
}

export function formatCompactNumber(value: number, locale: AppLocale, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits,
    notation: Math.abs(value) >= 10000 ? "compact" : "standard"
  }).format(value);
}

export function formatChartTick(days: number, t: TFunction): string {
  if (days <= 0) return "0";
  if (days < 365) return `${Math.max(1, Math.round(days))}${t("app.common.days.short")}`;
  return `${Math.round((days / 365.25) * 10) / 10}${t("app.common.years.short")}`;
}

export function formatPercent(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)}%`;
}

export function formatPercentCompact(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)}%`;
}

export function formatDate(value: string, locale: AppLocale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDay(value: string, locale: AppLocale): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function contactName(contact: WalletTransferContact): string {
  return personLabel(contact.profile, shortId(contact.contact_user_id));
}

export function contactInitial(contact: WalletTransferContact): string {
  return contactName(contact).trim().slice(0, 1).toUpperCase() || "?";
}

export function sellerName(listing: MarketplaceListing): string {
  return personLabel(listing.sellerProfile, shortId(listing.seller_user_id));
}

export function artifactInitial(listing: MarketplaceListing): string {
  return (listing.artifact?.title || listing.title).trim().slice(0, 1).toUpperCase() || "M";
}

export function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function shortHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function formatFixedUsd(value: string, locale: AppLocale): string {
  return formatRateMoney(Number(value), locale);
}

export function formatQuoteRate(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatAssetAmount(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(Number.isFinite(value) ? Math.max(0, value) : 0);
}

export function formatCryptoDepositDetails(row: WalletHistoryRow, locale: AppLocale): string {
  const details: string[] = [];
  if (row.assetAmount && row.assetCode && row.usdRate) {
    details.push(`${row.assetAmount} ${row.assetCode} × ${formatRateMoney(Number(row.usdRate), locale)}`);
  } else {
    details.push(`${row.assetCode ?? "TON"} · ${row.network ?? "mainnet"}`);
  }
  if (row.rateProvider) details.push(row.rateProvider);
  if (row.transactionHash) details.push(shortHash(row.transactionHash));
  return details.join(" · ");
}

export function formatCryptoWithdrawalDetails(row: WalletHistoryRow, locale: AppLocale, t: TFunction): string {
  const details: string[] = [];
  if (row.assetAmount && row.assetCode) details.push(`${row.assetAmount} ${row.assetCode}`);
  if (row.network) details.push(row.network);
  if (row.serviceFeeUsd) details.push(`${t("wallet.withdraw.serviceFeeShort")} ${formatFixedUsd(row.serviceFeeUsd, locale)}`);
  if (row.networkFeeReserveUsd) details.push(`${t("wallet.withdraw.networkFeeShort")} ${formatFixedUsd(row.networkFeeReserveUsd, locale)}`);
  if (row.destinationAddress) details.push(shortHash(row.destinationAddress));
  if (row.messageHash) details.push(shortHash(row.messageHash));
  return `${t(withdrawalStatusKey(row.invoiceStatus ?? "funds_reserved"))}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

export function isTonDepositTerminal(status: string): boolean {
  return ["credited", "credited_late", "credited_amount_mismatch", "rejected", "cancelled"].includes(status);
}

export function isTonDepositReusable(status: string): boolean {
  return [
    "ready",
    "detected",
    "finalizing",
    "confirmed_pending_credit",
    "awaiting_rate"
  ].includes(status);
}

export function tonDepositStatusKey(status: string): MessageKey {
  if (status === "ready") return "wallet.deposit.status.ready";
  if (status === "detected") return "wallet.deposit.status.detected";
  if (status === "finalizing") return "wallet.deposit.status.finalizing";
  if (status === "confirmed_pending_credit") return "wallet.deposit.status.confirmedPending";
  if (status === "credited" || status === "credited_late" || status === "credited_amount_mismatch") return "wallet.deposit.status.credited";
  if (status === "rejected") return "wallet.deposit.status.rejected";
  if (status === "cancelled") return "wallet.deposit.status.cancelled";
  if (status === "unmatched") return "wallet.deposit.status.unmatched";
  if (status === "awaiting_rate") return "wallet.deposit.status.awaitingRate";
  if (status === "expired") return "wallet.deposit.status.expired";
  return "wallet.deposit.status.waiting";
}

export function withdrawalStatusKey(status: string): MessageKey {
  if (status === "broadcast") return "wallet.withdraw.status.broadcast";
  if (status === "confirmed") return "wallet.withdraw.status.confirmed";
  if (status === "manual_review") return "wallet.withdraw.status.manualReview";
  if (status === "refunded") return "wallet.withdraw.status.refunded";
  if (status === "failed") return "wallet.withdraw.status.failed";
  if (status === "broadcasting") return "wallet.withdraw.status.broadcasting";
  return "wallet.withdraw.status.reserved";
}

export function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isValidPercentString(value: string): boolean {
  if (value.trim() === "") return false;
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

export function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

export function unitLabel(unit: TermUnit, t: TFunction): string {
  if (unit === "days") return t("app.common.days");
  if (unit === "months") return t("app.common.months.short");
  return t("app.common.years");
}

export function formatDuration(days: number, t: TFunction): string {
  const parts = formatDurationParts(days);
  if (parts.years <= 0 && parts.months <= 1) {
    return `${Math.max(1, Math.round(days))} ${t("app.common.days.short")}`;
  }

  const values: string[] = [];
  if (parts.years > 0) values.push(`${parts.years} ${t("app.common.years.short")}`);
  if (parts.months > 0) values.push(`${parts.months} ${t("app.common.months.short")}`);
  if (values.length === 0 && parts.days > 0) values.push(`${parts.days} ${t("app.common.days.short")}`);
  return values.join(" ");
}

export function formatTargetDate(days: number, locale: AppLocale): string {
  const date = new Date(Date.now() + Math.max(0, Math.round(days)) * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatTargetSummary(calculation: ReturnType<typeof findDaysToTarget>, t: TFunction): string {
  if (calculation.kind === "reached") return t("wallet.calculator.reached");
  if (calculation.kind === "unreachable") return t("wallet.calculator.unreachable");
  if (calculation.kind === "beyond-range") return t("wallet.calculator.beyondRange");
  return formatDuration(calculation.days, t);
}

export function targetCalculationDays(calculation: ReturnType<typeof findDaysToTarget>): number | null {
  if (calculation.kind === "reached") return 0;
  if (calculation.kind === "estimated") return Math.round(calculation.days);
  return null;
}
