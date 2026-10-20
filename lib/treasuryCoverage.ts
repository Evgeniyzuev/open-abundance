import { Address, TonClient } from "@ton/ton";
import { loadTonDepositConfig, resolveTonPriceResolution, type TonNetwork } from "@/lib/tonDeposits";
import { loadTonUsdtConfig, resolveTonUsdtPriceResolution } from "@/lib/tonUsdt";

type AnySupabase = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> } & Record<string, any>;

export type CoverageLight = "green" | "yellow" | "red" | "black" | "unknown";

export type TreasuryCoverageReport = {
  generatedAt: string;
  network: TonNetwork;
  liabilities: {
    walletAccounts: number;
    walletBalanceTotal: number;
    withdrawalsInFlight: number;
    manualReviewCount: number;
    manualReviewTotal: number;
    total: number;
  };
  treasury: {
    tonBalance: number | null;
    tonUsdRate: number | null;
    tonUsd: number | null;
    usdtBalance: number | null;
    usdtUsdRate: number | null;
    usdtUsd: number | null;
    totalUsd: number | null;
    errors: string[];
  };
  flows: {
    depositsCreditedTotal: number;
    withdrawalsPaidTotal: number;
  };
  coverageRatio: number | null;
  /** Coverage if the TON part of the reserve loses TON_STRESS_DROP of its value. */
  stressCoverageRatio: number | null;
  /** Share of the reserve held in volatile TON, 0..1. */
  volatileShare: number | null;
  light: CoverageLight;
  thresholds: { green: number; yellow: number; red: number };
  /** Paid withdrawals per UTC day over WITHDRAWAL_STATS_DAYS, as a share of the current Wallet balance. */
  withdrawalStats: { days: number; totalUsd: number; averageShare: number | null; medianShare: number | null; maxShare: number | null };
};

// Only a part of the Wallet is ever withdrawn at once, so full coverage is not required:
// green from 60%, yellow from 30%, red from 10%, black below 10%.
const GREEN_THRESHOLD = 0.6;
const YELLOW_THRESHOLD = 0.3;
const RED_THRESHOLD = 0.1;
const WITHDRAWAL_STATS_DAYS = 30;
const TON_STRESS_DROP = 0.3;

export async function buildTreasuryCoverageReport(supabase: AnySupabase): Promise<TreasuryCoverageReport> {
  const errors: string[] = [];
  const { data, error } = await supabase.rpc("treasury_liability_summary");
  if (error) throw new Error(error.message);
  const summary = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const num = (value: unknown) => Number(value ?? 0) || 0;

  const walletBalanceTotal = num(summary?.wallet_balance_total);
  const withdrawalsInFlight = num(summary?.withdrawals_in_flight_total);
  const manualReviewTotal = num(summary?.withdrawals_manual_review_total);
  const liabilityTotal = walletBalanceTotal + withdrawalsInFlight + manualReviewTotal;

  const depositConfig = await loadTonDepositConfig(supabase as never).catch(() => null);
  const network: TonNetwork = depositConfig?.network ?? "mainnet";

  let tonBalance: number | null = null;
  let tonRate: number | null = null;
  if (depositConfig?.deposit_address) {
    try {
      const client = new TonClient({ endpoint: jsonRpcEndpoint(depositConfig.toncenter_api_url), apiKey: process.env.TONCENTER_API_KEY?.trim() || undefined, timeout: 15_000 });
      tonBalance = Number(await client.getBalance(Address.parse(depositConfig.deposit_address))) / 1e9;
    } catch {
      errors.push("ton_balance_unavailable");
    }
    const rate = await resolveTonPriceResolution(network).catch(() => null);
    tonRate = rate?.snapshot ? Number(rate.snapshot.rate) : null;
    if (!tonRate) errors.push("ton_rate_unavailable");
  } else {
    errors.push("ton_deposit_config_missing");
  }

  let usdtBalance: number | null = null;
  let usdtRate: number | null = null;
  const usdtConfig = await loadTonUsdtConfig(supabase as never).catch(() => null);
  if (usdtConfig?.depositJettonWalletAddress) {
    try {
      const client = new TonClient({ endpoint: usdtConfig.rpcEndpoint, apiKey: usdtConfig.apiKey, timeout: 15_000 });
      const result = await client.runMethod(Address.parse(usdtConfig.depositJettonWalletAddress), "get_wallet_data");
      usdtBalance = Number(result.stack.readBigNumber()) / 10 ** usdtConfig.decimals;
    } catch {
      errors.push("usdt_balance_unavailable");
    }
    const rate = await resolveTonUsdtPriceResolution().catch(() => null);
    usdtRate = rate?.snapshot ? Number(rate.snapshot.rate) : null;
    if (!usdtRate) errors.push("usdt_rate_unavailable");
  }

  const tonUsd = tonBalance !== null && tonRate ? tonBalance * tonRate : null;
  const usdtUsd = usdtBalance !== null && usdtRate ? usdtBalance * usdtRate : null;
  const complete = errors.length === 0 && tonUsd !== null;
  const totalUsd = complete ? (tonUsd ?? 0) + (usdtUsd ?? 0) : null;
  const coverageRatio = totalUsd !== null && liabilityTotal > 0 ? totalUsd / liabilityTotal : totalUsd !== null ? Infinity : null;
  const light: CoverageLight = coverageRatio === null
    ? "unknown"
    : coverageRatio >= GREEN_THRESHOLD ? "green" : coverageRatio >= YELLOW_THRESHOLD ? "yellow" : coverageRatio >= RED_THRESHOLD ? "red" : "black";

  const withdrawalStats = await loadWithdrawalStats(supabase, walletBalanceTotal);

  const stressTotal = totalUsd !== null ? (tonUsd ?? 0) * (1 - TON_STRESS_DROP) + (usdtUsd ?? 0) : null;
  const stressRatio = stressTotal !== null && liabilityTotal > 0 ? stressTotal / liabilityTotal : null;
  const volatileShare = totalUsd !== null && totalUsd > 0 ? (tonUsd ?? 0) / totalUsd : null;

  return {
    generatedAt: new Date().toISOString(),
    network,
    liabilities: {
      walletAccounts: num(summary?.wallet_accounts_count),
      walletBalanceTotal,
      withdrawalsInFlight,
      manualReviewCount: num(summary?.withdrawals_manual_review_count),
      manualReviewTotal,
      total: liabilityTotal
    },
    treasury: { tonBalance, tonUsdRate: tonRate, tonUsd, usdtBalance, usdtUsdRate: usdtRate, usdtUsd, totalUsd, errors },
    flows: {
      depositsCreditedTotal: num(summary?.deposits_credited_total),
      withdrawalsPaidTotal: num(summary?.withdrawals_confirmed_total)
    },
    coverageRatio: coverageRatio === Infinity ? null : coverageRatio,
    stressCoverageRatio: stressRatio,
    volatileShare,
    light: coverageRatio === Infinity ? "green" : light,
    thresholds: { green: GREEN_THRESHOLD, yellow: YELLOW_THRESHOLD, red: RED_THRESHOLD },
    withdrawalStats
  };
}

async function loadWithdrawalStats(supabase: AnySupabase, walletBalanceTotal: number): Promise<TreasuryCoverageReport["withdrawalStats"]> {
  const empty = { days: WITHDRAWAL_STATS_DAYS, totalUsd: 0, averageShare: null, medianShare: null, maxShare: null };
  const since = new Date(Date.now() - WITHDRAWAL_STATS_DAYS * 24 * 60 * 60 * 1000);
  const perDay = new Map<string, number>();
  for (const table of ["ton_withdrawals", "ton_usdt_withdrawals"]) {
    const { data, error } = await supabase.from(table).select("payout_wallet_amount, created_at").in("status", ["broadcast", "confirmed"]).gte("created_at", since.toISOString());
    if (error || !Array.isArray(data)) return empty;
    for (const row of data as Array<{ payout_wallet_amount: unknown; created_at: string }>) {
      const day = String(row.created_at).slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + (Number(row.payout_wallet_amount) || 0));
    }
  }
  // Days without withdrawals count as zero, otherwise the median would only describe busy days.
  const amounts: number[] = [];
  for (let i = 0; i < WITHDRAWAL_STATS_DAYS; i += 1) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    amounts.push(perDay.get(day) ?? 0);
  }
  const totalUsd = amounts.reduce((sum, value) => sum + value, 0);
  if (walletBalanceTotal <= 0) return { ...empty, totalUsd };
  const shares = amounts.map((value) => value / walletBalanceTotal).sort((a, b) => a - b);
  const mid = Math.floor(shares.length / 2);
  const median = shares.length % 2 ? shares[mid] : (shares[mid - 1] + shares[mid]) / 2;
  return { days: WITHDRAWAL_STATS_DAYS, totalUsd, averageShare: totalUsd / WITHDRAWAL_STATS_DAYS / walletBalanceTotal, medianShare: median, maxShare: shares[shares.length - 1] };
}

function jsonRpcEndpoint(restUrl: string): string {
  const base = restUrl.replace(/\/+$/, "").replace(/\/jsonRPC$/i, "");
  return `${base}/jsonRPC`;
}

export type TreasuryAlertInput = {
  light: CoverageLight;
  lastNotifiedLight: string | null;
  lastNotifiedAt: Date | null;
  lastDigestAt: Date | null;
  now: Date;
};

const HOUR_MS = 60 * 60 * 1000;
const RED_REMINDER_MS = 24 * HOUR_MS;
const UNKNOWN_REMINDER_MS = 12 * HOUR_MS;
// The daily status digest goes out after 09:00 in Dubai (05:00 UTC).
const DIGEST_HOUR_UTC = 5;

/**
 * Decides which operator notifications are due.
 *
 * Alert: the light turning yellow or red, or the report failing (unknown). A red
 * light that persists reminds once a day, unknown every 12 hours; repeated yellow
 * and green never alert. Digest: one status message per day after 09:00 Dubai,
 * skipped when an alert was already sent in the same run.
 */
export function decideTreasuryAlert(input: TreasuryAlertInput): { alert: boolean; digest: boolean } {
  const { light, lastNotifiedLight, lastNotifiedAt, lastDigestAt, now } = input;
  const age = lastNotifiedAt ? now.getTime() - lastNotifiedAt.getTime() : Infinity;

  let alert = false;
  if (light === "yellow" || light === "red" || light === "black") {
    alert = lastNotifiedLight !== light || (light !== "yellow" && age >= RED_REMINDER_MS);
  } else if (light === "unknown") {
    alert = lastNotifiedLight !== "unknown" || age >= UNKNOWN_REMINDER_MS;
  }

  const todayDigestTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DIGEST_HOUR_UTC);
  const digestDue = now.getTime() >= todayDigestTime && (!lastDigestAt || lastDigestAt.getTime() < todayDigestTime);
  return { alert, digest: digestDue && !alert };
}
