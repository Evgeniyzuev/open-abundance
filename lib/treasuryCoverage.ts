import { Address, TonClient } from "@ton/ton";
import { loadTonDepositConfig, resolveTonPriceResolution, type TonNetwork } from "@/lib/tonDeposits";
import { loadTonUsdtConfig, resolveTonUsdtPriceResolution } from "@/lib/tonUsdt";

type AnySupabase = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> } & Record<string, any>;

export type CoverageLight = "green" | "yellow" | "red" | "unknown";

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
  light: CoverageLight;
  thresholds: { green: number; yellow: number };
};

// Green requires a safety buffer above full coverage; yellow is covered without a buffer.
const GREEN_THRESHOLD = 1.25;
const YELLOW_THRESHOLD = 1;

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
    : coverageRatio >= GREEN_THRESHOLD ? "green" : coverageRatio >= YELLOW_THRESHOLD ? "yellow" : "red";

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
    light: coverageRatio === Infinity ? "green" : light,
    thresholds: { green: GREEN_THRESHOLD, yellow: YELLOW_THRESHOLD }
  };
}

function jsonRpcEndpoint(restUrl: string): string {
  const base = restUrl.replace(/\/+$/, "").replace(/\/jsonRPC$/i, "");
  return `${base}/jsonRPC`;
}
