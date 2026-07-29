import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

export type TonNetwork = "testnet" | "mainnet";
export type TonDepositConfig = {
  network: TonNetwork;
  asset_code: "TON";
  deposit_address: string;
  toncenter_api_url: string;
};
export type TonPriceSnapshot = {
  rate: string;
  provider: string;
  sourceTimestamp: string | null;
  metadata: Json;
};
export type TonPriceResolution = {
  snapshot: TonPriceSnapshot | null;
  failureReason: "providers_unavailable" | "provider_deviation" | null;
  diagnostics: Json;
};

const DEFAULT_TESTNET_TONCENTER_URL = "https://testnet.toncenter.com/api/v2";
const DEFAULT_MAINNET_TONCENTER_URL = "https://toncenter.com/api/v2";
const DEFAULT_DIA_TON_PRICE_URL = "https://api.diadata.org/v1/assetQuotation/Ton/0x0000000000000000000000000000000000000000";
const DEFAULT_DIA_USDT_PRICE_URL = "https://api.diadata.org/v1/assetQuotation/Ethereum/0xdac17f958d2ee523a2206206994597c13d831ec7";
const DEFAULT_COINGECKO_TON_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd&include_last_updated_at=true";
const DEFAULT_DIA_MAX_AGE_SECONDS = 300;
const PRICE_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_PROVIDER_DEVIATION_PERCENT = 2;
const DIA_TON_IDENTITY = {
  symbol: "TON",
  blockchain: "ton",
  address: "0x0000000000000000000000000000000000000000"
} as const;
const DIA_USDT_IDENTITY = {
  symbol: "USDT",
  blockchain: "ethereum",
  address: "0xdac17f958d2ee523a2206206994597c13d831ec7"
} as const;

type DiaAssetQuotation = {
  Symbol?: unknown;
  Blockchain?: unknown;
  Address?: unknown;
  Price?: unknown;
  Time?: unknown;
  Source?: unknown;
};
type CoinGeckoSimplePrice = {
  "the-open-network"?: {
    usd?: unknown;
    last_updated_at?: unknown;
  };
};

export async function loadTonDepositConfig(supabase: SupabaseClient<Database>): Promise<TonDepositConfig | null> {
  const network = resolveTonNetwork();
  const { data, error } = await supabase
    .from("ton_deposit_config")
    .select("network,asset_code,deposit_address,toncenter_api_url")
    .eq("network", network)
    .eq("asset_code", "TON")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (data) {
    return {
      network: data.network as TonNetwork,
      asset_code: "TON",
      deposit_address: data.deposit_address,
      toncenter_api_url: data.toncenter_api_url
    };
  }

  const depositAddress = process.env.TON_DEPOSIT_ADDRESS?.trim();
  if (depositAddress) {
    return {
      network,
      asset_code: "TON",
      deposit_address: depositAddress,
      toncenter_api_url: process.env.TONCENTER_API_URL?.trim() || (network === "mainnet" ? DEFAULT_MAINNET_TONCENTER_URL : DEFAULT_TESTNET_TONCENTER_URL)
    };
  }

  if (error) throw new Error(error.message);
  return null;
}

export function resolveTonNetwork(): TonNetwork {
  return process.env.TON_DEPOSIT_NETWORK === "testnet" ? "testnet" : "mainnet";
}

export async function resolveTonPriceSnapshot(network: TonNetwork): Promise<TonPriceSnapshot | null> {
  return (await resolveTonPriceResolution(network)).snapshot;
}

export async function resolveTonPriceResolution(network: TonNetwork): Promise<TonPriceResolution> {
  if (network === "testnet") {
    const configuredRate = (process.env.TON_TESTNET_USD_RATE?.trim() || "1").trim();
    if (!isPositiveDecimal(configuredRate)) {
      return {
        snapshot: null,
        failureReason: "providers_unavailable",
        diagnostics: { selectedProvider: null, testRateValid: false }
      };
    }
    const sourceTimestamp = new Date().toISOString();
    return {
      snapshot: {
        rate: configuredRate,
        provider: "test_fixture",
        sourceTimestamp,
        metadata: {
          selectedProvider: "test_fixture",
          primaryRate: configuredRate,
          primaryTimestamp: sourceTimestamp
        }
      },
      failureReason: null,
      diagnostics: { selectedProvider: "test_fixture" }
    };
  }

  const diaEndpoint = process.env.DIA_TON_PRICE_URL?.trim() || DEFAULT_DIA_TON_PRICE_URL;
  const [diaQuote, coinGeckoQuote] = await Promise.all([
    resolveDiaPriceSnapshot(diaEndpoint, DIA_TON_IDENTITY),
    resolveCoinGeckoTonPriceSnapshot()
  ]);

  if (!diaQuote && !coinGeckoQuote) {
    return {
      snapshot: null,
      failureReason: "providers_unavailable",
      diagnostics: {
        selectedProvider: null,
        primaryProvider: "dia_asset_quotation",
        primaryAvailable: false,
        secondaryProvider: "coingecko_simple_price",
        secondaryAvailable: false
      }
    };
  }

  const deviationPercent = diaQuote && coinGeckoQuote
    ? calculateDeviationPercent(diaQuote.rate, coinGeckoQuote.rate)
    : null;
  const maxDeviationPercent = clampProviderDeviationPercent(process.env.TON_PRICE_MAX_DEVIATION_PERCENT);

  if (deviationPercent !== null && deviationPercent > maxDeviationPercent) {
    return {
      snapshot: null,
      failureReason: "provider_deviation",
      diagnostics: {
        selectedProvider: null,
        primaryProvider: "dia_asset_quotation",
        primaryRate: diaQuote?.rate ?? null,
        primaryTimestamp: diaQuote?.sourceTimestamp ?? null,
        secondaryProvider: "coingecko_simple_price",
        secondaryRate: coinGeckoQuote?.rate ?? null,
        secondaryTimestamp: coinGeckoQuote?.sourceTimestamp ?? null,
        deviationPercent,
        maxDeviationPercent
      }
    };
  }

  const selected = diaQuote ?? coinGeckoQuote;
  if (!selected) {
    return { snapshot: null, failureReason: "providers_unavailable", diagnostics: {} };
  }

  const diagnostics = {
    selectedProvider: selected.provider,
    fallbackReason: diaQuote ? null : "dia_unavailable",
    primaryProvider: "dia_asset_quotation",
    primaryRate: diaQuote?.rate ?? null,
    primaryTimestamp: diaQuote?.sourceTimestamp ?? null,
    secondaryProvider: "coingecko_simple_price",
    secondaryRate: coinGeckoQuote?.rate ?? null,
    secondaryTimestamp: coinGeckoQuote?.sourceTimestamp ?? null,
    deviationPercent,
    maxDeviationPercent
  };
  return {
    snapshot: {
      ...selected,
      metadata: diagnostics
    },
    failureReason: null,
    diagnostics
  };
}

export async function resolveUsdtPriceSnapshot(): Promise<TonPriceSnapshot | null> {
  const configuredEndpoint = process.env.DIA_USDT_PRICE_URL?.trim();
  if (!configuredEndpoint) return resolveDiaPriceSnapshot(DEFAULT_DIA_USDT_PRICE_URL, DIA_USDT_IDENTITY);

  const configuredQuote = await resolveDiaPriceSnapshot(configuredEndpoint, DIA_USDT_IDENTITY);
  return configuredQuote ?? resolveDiaPriceSnapshot(DEFAULT_DIA_USDT_PRICE_URL, DIA_USDT_IDENTITY);
}

async function resolveDiaPriceSnapshot(
  endpoint: string,
  identity: { symbol: string; blockchain: string; address: string }
): Promise<TonPriceSnapshot | null> {
  const maxAgeSeconds = clampDiaMaxAgeSeconds(process.env.DIA_TON_PRICE_MAX_AGE_SECONDS);
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PRICE_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) return null;

    const quotation = (await response.json()) as DiaAssetQuotation;
    const rate = normalizePositiveRate(quotation.Price);
    const sourceTimestamp = normalizeFreshTimestamp(quotation.Time, maxAgeSeconds);
    const symbol = typeof quotation.Symbol === "string" ? quotation.Symbol.trim().toUpperCase() : "";
    const blockchain = typeof quotation.Blockchain === "string" ? quotation.Blockchain.trim().toLowerCase() : "";
    const address = typeof quotation.Address === "string" ? quotation.Address.trim().toLowerCase() : "";

    if (
      !rate
      || !sourceTimestamp
      || symbol !== identity.symbol
      || blockchain !== identity.blockchain
      || address !== identity.address
    ) {
      return null;
    }

    return {
      rate,
      provider: "dia_asset_quotation",
      sourceTimestamp,
      metadata: {}
    };
  } catch {
    return null;
  }
}

async function resolveCoinGeckoTonPriceSnapshot(): Promise<TonPriceSnapshot | null> {
  const endpoint = process.env.COINGECKO_TON_PRICE_URL?.trim() || DEFAULT_COINGECKO_TON_PRICE_URL;
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const headers: HeadersInit = { Accept: "application/json" };
  if (apiKey) {
    headers[endpoint.includes("pro-api.coingecko.com") ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = apiKey;
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(PRICE_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as CoinGeckoSimplePrice;
    const quote = payload["the-open-network"];
    const rate = normalizePositiveRate(quote?.usd);
    const sourceTimestamp = normalizeFreshUnixTimestamp(
      quote?.last_updated_at,
      clampDiaMaxAgeSeconds(process.env.DIA_TON_PRICE_MAX_AGE_SECONDS)
    );
    if (!rate || !sourceTimestamp) return null;

    return {
      rate,
      provider: "coingecko_simple_price",
      sourceTimestamp,
      metadata: {}
    };
  } catch {
    return null;
  }
}

function isPositiveDecimal(value: string): boolean {
  return /^(?:\d+)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizePositiveRate(value: unknown): string | null {
  const normalized = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  return isPositiveDecimal(normalized) ? normalized : null;
}

function normalizeFreshTimestamp(value: unknown, maxAgeSeconds: number): string | null {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value);
  const timestampMs = timestamp.getTime();
  if (!Number.isFinite(timestampMs)) return null;

  const ageMs = Date.now() - timestampMs;
  if (ageMs < -60_000 || ageMs > maxAgeSeconds * 1_000) return null;
  return timestamp.toISOString();
}

function normalizeFreshUnixTimestamp(value: unknown, maxAgeSeconds: number): string | null {
  const seconds = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return normalizeFreshTimestamp(new Date(seconds * 1_000).toISOString(), maxAgeSeconds);
}

function clampDiaMaxAgeSeconds(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DIA_MAX_AGE_SECONDS;
  return Math.max(120, Math.min(3_600, Math.floor(parsed)));
}

function clampProviderDeviationPercent(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_PROVIDER_DEVIATION_PERCENT;
  return Math.max(0.1, Math.min(10, parsed));
}

function calculateDeviationPercent(leftRate: string, rightRate: string): number | null {
  const left = Number(leftRate);
  const right = Number(rightRate);
  const midpoint = (left + right) / 2;
  if (!Number.isFinite(left) || !Number.isFinite(right) || midpoint <= 0) return null;
  return Math.abs(left - right) / midpoint * 100;
}

export function normalizeTonAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^-?\d+:[0-9a-f]{64}$/i.test(normalized)) {
    const [workchain, hash] = normalized.split(":");
    return `${Number(workchain)}:${hash.toLowerCase()}`;
  }

  try {
    const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(base64, "base64");
    if (decoded.length === 36) {
      const workchain = decoded[1] >= 128 ? decoded[1] - 256 : decoded[1];
      return `${workchain}:${Buffer.from(decoded.subarray(2, 34)).toString("hex")}`;
    }
  } catch {
    // Keep the original value for an invalid or unsupported address format.
  }

  return normalized;
}

export function normalizeTonCenterUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function parsePositiveNanoTon(value: unknown): string | null {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,39}$/.test(normalized) || normalized === "0") return null;
  return normalized;
}

export function postgresNumericToString(value: unknown): string | null {
  const normalized = typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}

export function extractTonTextComment(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();

  const msgData = record.msg_data;
  if (!msgData || typeof msgData !== "object") return null;
  const data = msgData as Record<string, unknown>;
  if (typeof data.text !== "string" || !data.text.trim()) return null;
  const rawText = data.text.trim();
  if (/^oa_ton_[a-f0-9-]{20,80}$/i.test(rawText)) return rawText;

  try {
    const decoded = Buffer.from(rawText, "base64").toString("utf8").replace(/^\u0000+/, "").trim();
    return /^oa_ton_[a-f0-9-]{20,80}$/i.test(decoded) ? decoded : rawText;
  } catch {
    return rawText;
  }
}

export function buildTonTransferLink(address: string, invoiceCode: string, expectedAmountNano?: string | null): string {
  const params = new URLSearchParams({ text: invoiceCode });
  if (expectedAmountNano) params.set("amount", expectedAmountNano);
  return `ton://transfer/${encodeURIComponent(address)}?${params.toString()}`;
}

export function invoiceCodeFromComment(comment: string | null): string | null {
  if (!comment) return null;
  const normalized = comment.trim();
  if (!/^oa_ton_[a-f0-9-]{20,80}$/i.test(normalized)) return null;
  return normalized;
}
