import "server-only";

import { mnemonicToPrivateKey } from "@ton/crypto";
import {
  Address,
  beginCell,
  Cell,
  internal,
  JettonMaster,
  toNano,
  TonClient,
  WalletContractV4,
  type OpenedContract
} from "@ton/ton";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTonWithdrawalConfig } from "@/lib/tonWithdrawals";
import { resolveTonPriceResolution, resolveUsdtPriceSnapshot, type TonNetwork, type TonPriceSnapshot } from "@/lib/tonDeposits";

export const TON_USDT_MASTER_ADDRESS = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
export const TON_USDT_DECIMALS = 6;
const DEFAULT_MAINNET_TONCENTER_REST_URL = "https://toncenter.com/api/v2";
const DEFAULT_MAINNET_TONCENTER_RPC_URL = "https://toncenter.com/api/v2/jsonRPC";
const DEFAULT_TESTNET_TONCENTER_REST_URL = "https://testnet.toncenter.com/api/v2";
const DEFAULT_TESTNET_TONCENTER_RPC_URL = "https://testnet.toncenter.com/api/v2/jsonRPC";
const PRICE_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_PROVIDER_DEVIATION_PERCENT = 2;

type AnySupabaseClient = SupabaseClient<any>;

export type TonUsdtConfig = {
  enabled: boolean;
  ready: boolean;
  reason: "disabled" | "owner_missing" | "master_invalid" | "jetton_wallet_missing" | "ready";
  network: TonNetwork;
  masterAddress: string;
  depositOwnerAddress: string;
  depositJettonWalletAddress: string;
  decimals: number;
  endpoint: string;
  rpcEndpoint: string;
  apiKey?: string;
  withdrawalEnabled: boolean;
  serviceFeePercent: string;
  networkFeeEstimateTon: string;
  networkFeeFloorTon: string;
  minAmountUsdt: string;
  maxAmountUsdt: string;
  transferTonAmount: string;
};

export type TonUsdtPriceResolution = {
  snapshot: TonPriceSnapshot | null;
  failureReason: "providers_unavailable" | "provider_deviation" | null;
  diagnostics: Record<string, unknown>;
};

export type TonUsdtWithdrawalQuote = {
  network: TonNetwork;
  assetCode: "USDT";
  decimals: number;
  masterAddress: string;
  serviceFeePercent: string;
  networkFeeEstimateTon: string;
  networkFeeReserveTon: string;
  minAmountUsdt: string;
  maxAmountUsdt: string;
  usdtUsdRate: string;
  usdtRateProvider: string;
  usdtRateSourceTimestamp: string | null;
  tonUsdRate: string;
  tonRateProvider: string;
  tonRateSourceTimestamp: string | null;
  amountUsdt?: string;
  amountUnits?: string;
  payoutWalletAmount?: string;
  serviceFeeAmount?: string;
  networkFeeReserveAmount?: string;
  totalWalletDebitAmount?: string;
};

export class TonUsdtWithdrawalBroadcastError extends Error {
  readonly stage: "prepare" | "broadcast";

  constructor(message: string, stage: "prepare" | "broadcast") {
    super(message);
    this.name = "TonUsdtWithdrawalBroadcastError";
    this.stage = stage;
  }
}

export async function loadTonUsdtConfig(supabase?: AnySupabaseClient): Promise<TonUsdtConfig | null> {
  const enabled = configuredEnvValue(process.env.TON_USDT_ENABLED)?.toLowerCase() === "true";
  if (!enabled) return null;

  const network: TonNetwork = configuredEnvValue(process.env.TON_USDT_NETWORK) === "testnet" ? "testnet" : "mainnet";
  const dbConfig = supabase ? await loadDatabaseConfig(supabase, network) : null;
  const masterAddress = normalizeTonAddress(
    dbConfig?.master_address || configuredEnvValue(process.env.TON_USDT_MASTER_ADDRESS) || TON_USDT_MASTER_ADDRESS,
    network
  );
  const ownerAddress = normalizeTonAddress(
    dbConfig?.deposit_owner_address
      || configuredEnvValue(process.env.TON_USDT_DEPOSIT_OWNER_ADDRESS)
      || configuredEnvValue(process.env.TON_DEPOSIT_ADDRESS)
      || configuredEnvValue(process.env.TON_WITHDRAWAL_SOURCE_ADDRESS),
    network
  );
  const configuredJettonWallet = normalizeTonAddress(
    dbConfig?.deposit_jetton_wallet_address || configuredEnvValue(process.env.TON_USDT_JETTON_WALLET_ADDRESS),
    network
  );
  const configuredToncenterEndpoint = configuredEnvValue(dbConfig?.toncenter_api_url)
    || configuredEnvValue(process.env.TON_USDT_TONCENTER_URL)
    || configuredEnvValue(process.env.TONCENTER_API_URL);
  const endpoint = normalizeTonCenterRestEndpoint(
    configuredToncenterEndpoint
      || (network === "mainnet" ? DEFAULT_MAINNET_TONCENTER_REST_URL : DEFAULT_TESTNET_TONCENTER_REST_URL)
  );
  const rpcEndpoint = normalizeTonCenterRpcEndpoint(
    configuredEnvValue(process.env.TON_USDT_TONCENTER_URL)
      || configuredEnvValue(dbConfig?.toncenter_api_url)
      || configuredEnvValue(process.env.TONCENTER_API_URL)
      || (network === "mainnet" ? DEFAULT_MAINNET_TONCENTER_RPC_URL : DEFAULT_TESTNET_TONCENTER_RPC_URL)
  );
  const masterIsAllowed = Boolean(masterAddress)
    && (network !== "mainnet" || masterAddress === normalizeTonAddress(TON_USDT_MASTER_ADDRESS, network));
  const configuredDecimals = Number(configuredEnvValue(process.env.TON_USDT_DECIMALS) || dbConfig?.decimals || TON_USDT_DECIMALS);
  const withdrawalConfig = loadTonWithdrawalConfig();
  const config: TonUsdtConfig = {
    enabled: true,
    ready: false,
    reason: "disabled",
    network,
    masterAddress: masterAddress ?? TON_USDT_MASTER_ADDRESS,
    depositOwnerAddress: ownerAddress ?? "",
    depositJettonWalletAddress: configuredJettonWallet ?? "",
    decimals: configuredDecimals,
    endpoint,
    rpcEndpoint,
    apiKey: configuredEnvValue(process.env.TONCENTER_API_KEY),
    withdrawalEnabled: configuredEnvValue(process.env.TON_USDT_WITHDRAWAL_ENABLED)?.toLowerCase() === "true",
    serviceFeePercent: positiveConfiguredDecimal(process.env.TON_USDT_SERVICE_FEE_PERCENT, "1"),
    networkFeeEstimateTon: positiveConfiguredDecimal(process.env.TON_USDT_NETWORK_FEE_ESTIMATE_TON, "0.02"),
    networkFeeFloorTon: positiveConfiguredDecimal(process.env.TON_USDT_NETWORK_FEE_FLOOR_TON, "0.1"),
    minAmountUsdt: positiveConfiguredDecimal(process.env.TON_USDT_MIN, "1"),
    maxAmountUsdt: positiveConfiguredDecimal(process.env.TON_USDT_MAX, "100"),
    transferTonAmount: positiveConfiguredDecimal(process.env.TON_USDT_TRANSFER_TON, "0.05")
  };

  if (!masterIsAllowed || configuredDecimals !== TON_USDT_DECIMALS) return { ...config, reason: "master_invalid" };
  if (!ownerAddress) return { ...config, reason: "owner_missing" };
  if (!configuredJettonWallet) {
    const derived = await deriveTonUsdtJettonWallet(config);
    if (!derived) return { ...config, reason: "jetton_wallet_missing" };
    return { ...config, ready: true, reason: "ready", depositJettonWalletAddress: derived };
  }

  const derived = await deriveTonUsdtJettonWallet(config);
  if (!derived || derived !== configuredJettonWallet) return { ...config, reason: "jetton_wallet_missing" };
  return { ...config, ready: true, reason: "ready", depositJettonWalletAddress: derived };
}

async function loadDatabaseConfig(supabase: AnySupabaseClient, network: TonNetwork) {
  const { data } = await supabase
    .from("ton_usdt_config")
    .select("network,master_address,deposit_owner_address,deposit_jetton_wallet_address,toncenter_api_url,decimals")
    .eq("network", network)
    .eq("asset_code", "USDT")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  return data as {
    network: string;
    master_address: string;
    deposit_owner_address: string;
    deposit_jetton_wallet_address: string;
    toncenter_api_url: string;
    decimals: number;
  } | null;
}

export async function deriveTonUsdtJettonWallet(config: TonUsdtConfig): Promise<string | null> {
  try {
    if (!config.masterAddress || !config.depositOwnerAddress) return null;
    const client = new TonClient({ endpoint: config.rpcEndpoint, apiKey: config.apiKey, timeout: 15_000 });
    const master = client.open(JettonMaster.create(Address.parse(config.masterAddress)));
    const owner = Address.parse(config.depositOwnerAddress);
    return (await master.getWalletAddress(owner)).toRawString();
  } catch {
    return null;
  }
}

export async function resolveTonUsdtPriceResolution(): Promise<TonUsdtPriceResolution> {
  const [diaQuote, coinGeckoQuote] = await Promise.all([
    resolveUsdtPriceSnapshot(),
    resolveCoinGeckoUsdtPriceSnapshot()
  ]);
  if (!diaQuote && !coinGeckoQuote) {
    return {
      snapshot: null,
      failureReason: "providers_unavailable",
      diagnostics: { selectedProvider: null, primaryProvider: "dia_asset_quotation", secondaryProvider: "coingecko_simple_price" }
    };
  }
  const deviationPercent = diaQuote && coinGeckoQuote ? calculateDeviationPercent(diaQuote.rate, coinGeckoQuote.rate) : null;
  const maxDeviationPercent = clampDeviation(process.env.TON_PRICE_MAX_DEVIATION_PERCENT);
  if (deviationPercent !== null && deviationPercent > maxDeviationPercent) {
    return {
      snapshot: null,
      failureReason: "provider_deviation",
      diagnostics: {
        selectedProvider: null,
        primaryProvider: diaQuote?.provider ?? "dia_asset_quotation",
        primaryRate: diaQuote?.rate ?? null,
        secondaryProvider: coinGeckoQuote?.provider ?? "coingecko_simple_price",
        secondaryRate: coinGeckoQuote?.rate ?? null,
        deviationPercent,
        maxDeviationPercent
      }
    };
  }
  const selected = diaQuote ?? coinGeckoQuote;
  if (!selected) return { snapshot: null, failureReason: "providers_unavailable", diagnostics: {} };
  const diagnostics = {
    selectedProvider: selected.provider,
    fallbackReason: diaQuote ? null : "dia_unavailable",
    primaryProvider: diaQuote?.provider ?? "dia_asset_quotation",
    primaryRate: diaQuote?.rate ?? null,
    secondaryProvider: coinGeckoQuote?.provider ?? "coingecko_simple_price",
    secondaryRate: coinGeckoQuote?.rate ?? null,
    deviationPercent,
    maxDeviationPercent
  };
  return { snapshot: { ...selected, metadata: diagnostics }, failureReason: null, diagnostics };
}

async function resolveCoinGeckoUsdtPriceSnapshot(): Promise<TonPriceSnapshot | null> {
  const endpoint = configuredEnvValue(process.env.COINGECKO_USDT_PRICE_URL)
    || "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd&include_last_updated_at=true";
  const apiKey = configuredEnvValue(process.env.COINGECKO_API_KEY);
  const headers: HeadersInit = { Accept: "application/json" };
  if (apiKey) headers[endpoint.includes("pro-api.coingecko.com") ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = apiKey;
  try {
    const response = await fetch(endpoint, { cache: "no-store", headers, signal: AbortSignal.timeout(PRICE_REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    const payload = (await response.json()) as { tether?: { usd?: unknown; last_updated_at?: unknown } };
    const rate = normalizePositiveDecimal(payload.tether?.usd);
    const timestamp = Number(payload.tether?.last_updated_at);
    if (!rate || !Number.isFinite(timestamp) || timestamp <= 0) return null;
    const sourceTimestamp = new Date(timestamp * 1_000);
    if (Date.now() - sourceTimestamp.getTime() > 300_000 || sourceTimestamp.getTime() > Date.now() + 60_000) return null;
    return { rate, provider: "coingecko_simple_price", sourceTimestamp: sourceTimestamp.toISOString(), metadata: {} };
  } catch {
    return null;
  }
}

export async function resolveTonUsdtWithdrawalQuote(config: TonUsdtConfig, amountUsdt?: string): Promise<TonUsdtWithdrawalQuote> {
  const [usdtResolution, tonResolution] = await Promise.all([
    resolveTonUsdtPriceResolution(),
    resolveTonPriceResolution(config.network)
  ]);
  if (!usdtResolution.snapshot) throw new Error(usdtResolution.failureReason === "provider_deviation" ? "USDT price providers disagree. Try again later." : "USDT withdrawal rate is temporarily unavailable.");
  if (!tonResolution.snapshot) throw new Error(tonResolution.failureReason === "provider_deviation" ? "TON price providers disagree. Try again later." : "TON withdrawal rate is temporarily unavailable.");
  const networkFeeReserveTon = decimalString(Math.max(Number(config.networkFeeEstimateTon) * 2, Number(config.networkFeeFloorTon)), 9);
  const quote: TonUsdtWithdrawalQuote = {
    network: config.network,
    assetCode: "USDT",
    decimals: config.decimals,
    masterAddress: config.masterAddress,
    serviceFeePercent: config.serviceFeePercent,
    networkFeeEstimateTon: config.networkFeeEstimateTon,
    networkFeeReserveTon,
    minAmountUsdt: config.minAmountUsdt,
    maxAmountUsdt: config.maxAmountUsdt,
    usdtUsdRate: usdtResolution.snapshot.rate,
    usdtRateProvider: usdtResolution.snapshot.provider,
    usdtRateSourceTimestamp: usdtResolution.snapshot.sourceTimestamp,
    tonUsdRate: tonResolution.snapshot.rate,
    tonRateProvider: tonResolution.snapshot.provider,
    tonRateSourceTimestamp: tonResolution.snapshot.sourceTimestamp
  };
  if (!amountUsdt) return quote;
  const units = parseTonUsdtUnits(amountUsdt, config.decimals);
  if (!units) throw new Error("Enter a positive USDT amount with no more than 6 decimal places.");
  const normalizedAmountUsdt = tonUsdtUnitsToDecimal(units, config.decimals);
  const amount = Number(normalizedAmountUsdt);
  if (!Number.isFinite(amount) || amount < Number(config.minAmountUsdt) || amount > Number(config.maxAmountUsdt)) {
    throw new Error(`USDT withdrawal amount must be between ${config.minAmountUsdt} and ${config.maxAmountUsdt} USDT.`);
  }
  const payoutWalletAmount = amount * Number(usdtResolution.snapshot.rate);
  const serviceFeeAmount = payoutWalletAmount * Number(config.serviceFeePercent) / 100;
  const networkFeeReserveAmount = Number(networkFeeReserveTon) * Number(tonResolution.snapshot.rate);
  return {
    ...quote,
    amountUsdt: normalizedAmountUsdt,
    amountUnits: units,
    payoutWalletAmount: decimalString(payoutWalletAmount, 12),
    serviceFeeAmount: decimalString(serviceFeeAmount, 12),
    networkFeeReserveAmount: decimalString(networkFeeReserveAmount, 12),
    totalWalletDebitAmount: decimalString(payoutWalletAmount + serviceFeeAmount + networkFeeReserveAmount, 12)
  };
}

export function parseTonUsdtUnits(value: unknown, decimals = TON_USDT_DECIMALS): string | null {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(raw) || raw === "0" || raw.length > 39) return null;
  return raw;
}

export function tonUsdtUnitsToDecimal(units: string, decimals = TON_USDT_DECIMALS): string {
  const normalized = units.replace(/^0+(?=\d)/, "") || "0";
  if (decimals === 0) return normalized;
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function normalizeTonUsdtAddress(value: unknown, network: TonNetwork): { raw: string; friendly: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const address = Address.parse(value.trim());
    if (address.workChain !== 0) return null;
    return { raw: address.toRawString(), friendly: address.toString({ bounceable: true, testOnly: network === "testnet" }) };
  } catch {
    return null;
  }
}

export function buildTonUsdtTransferLink(ownerAddress: string, masterAddress: string, amountUnits?: string | null, invoiceCode?: string): string {
  const params = new URLSearchParams({ jetton: masterAddress });
  if (amountUnits) params.set("amount", amountUnits);
  if (invoiceCode) params.set("text", invoiceCode);
  return `ton://transfer/${encodeURIComponent(ownerAddress)}?${params.toString()}`;
}

export async function broadcastTonUsdtWithdrawal({
  config,
  amountUnits,
  destinationAddress,
  comment
}: {
  config: TonUsdtConfig;
  amountUnits: string;
  destinationAddress: string;
  comment: string;
}): Promise<{ sourceAddress: string; seqno: number; messageHash: string }> {
  const withdrawalConfig = loadTonWithdrawalConfig();
  if (!withdrawalConfig.mnemonic) throw new TonUsdtWithdrawalBroadcastError("TON USDT withdrawal signer is not configured.", "prepare");
  let contract: OpenedContract<WalletContractV4>;
  let transfer: Awaited<ReturnType<WalletContractV4["createTransfer"]>>;
  let sourceAddress = "";
  let seqno = 0;
  try {
    const keyPair = await mnemonicToPrivateKey(withdrawalConfig.mnemonic);
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    sourceAddress = wallet.address.toString({ bounceable: true, testOnly: config.network === "testnet" });
    const configuredSource = configuredEnvValue(process.env.TON_WITHDRAWAL_SOURCE_ADDRESS);
    if (configuredSource) {
      const normalized = normalizeTonUsdtAddress(configuredSource, config.network);
      if (!normalized || normalized.raw !== wallet.address.toRawString()) throw new Error("TON USDT source address does not match the configured signer.");
    }
    const destination = normalizeTonUsdtAddress(destinationAddress, config.network);
    if (!destination) throw new Error("Enter a valid TON address.");
    const destinationAddressObject = Address.parse(destination.raw);
    if (destination.raw === wallet.address.toRawString()) throw new Error("Withdrawal address must differ from the operating wallet.");
    const client = new TonClient({ endpoint: config.rpcEndpoint, apiKey: config.apiKey, timeout: 15_000 });
    const master = client.open(JettonMaster.create(Address.parse(config.masterAddress)));
    const jettonWalletAddress = await master.getWalletAddress(wallet.address);
    if (config.depositJettonWalletAddress && jettonWalletAddress.toRawString() !== normalizeTonAddress(config.depositJettonWalletAddress, config.network)) {
      throw new Error("TON USDT Jetton wallet does not match the configured master and owner.");
    }
    contract = client.open(wallet);
    seqno = await contract.getSeqno();
    const queryId = BigInt(`0x${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`);
    const forwardPayload = beginCell().storeUint(0, 32).storeStringTail(comment).endCell();
    const body = beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(queryId, 64)
      .storeCoins(BigInt(amountUnits))
      .storeAddress(destinationAddressObject)
      .storeAddress(wallet.address)
      .storeBit(0)
      .storeCoins(1)
      .storeBit(1)
      .storeRef(forwardPayload)
      .endCell();
    transfer = await contract.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [internal({ to: jettonWalletAddress, value: toNano(config.transferTonAmount), body })]
    });
  } catch (error) {
    throw new TonUsdtWithdrawalBroadcastError(error instanceof Error ? error.message : "Could not prepare TON USDT transaction.", "prepare");
  }
  try {
    await contract.send(transfer);
  } catch (error) {
    throw new TonUsdtWithdrawalBroadcastError(error instanceof Error ? error.message : "TON USDT broadcast status is unknown.", "broadcast");
  }
  return { sourceAddress, seqno, messageHash: transfer.hash().toString("hex") };
}

function normalizeTonCenterRestEndpoint(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/jsonRPC$/i, "");
}

function normalizeTonCenterRpcEndpoint(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  return /\/jsonRPC$/i.test(normalized) ? normalized : `${normalized}/jsonRPC`;
}

function normalizeTonAddress(value: unknown, network: TonNetwork): string | null {
  const parsed = normalizeTonUsdtAddress(value, network);
  return parsed?.raw ?? null;
}

function configuredEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (normalized.length >= 2 && ((first === '"' && last === '"') || (first === "'" && last === "'"))) return normalized.slice(1, -1).trim() || undefined;
  return normalized;
}

function positiveConfiguredDecimal(value: string | undefined, fallback: string): string {
  const normalized = configuredEnvValue(value) || fallback;
  return /^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0 ? normalized : fallback;
}

function normalizePositiveDecimal(value: unknown): string | null {
  const normalized = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  return /^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0 ? normalized : null;
}

function calculateDeviationPercent(leftRate: string, rightRate: string): number | null {
  const left = Number(leftRate);
  const right = Number(rightRate);
  const midpoint = (left + right) / 2;
  return Number.isFinite(left) && Number.isFinite(right) && midpoint > 0 ? Math.abs(left - right) / midpoint * 100 : null;
}

function clampDeviation(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0.1, Math.min(10, parsed)) : DEFAULT_MAX_PROVIDER_DEVIATION_PERCENT;
}

function decimalString(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "") || "0";
}