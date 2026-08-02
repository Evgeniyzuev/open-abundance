import "server-only";

import { mnemonicToPrivateKey } from "@ton/crypto";
import { Address, internal, toNano, TonClient, WalletContractV4 } from "@ton/ton";
import type { OpenedContract } from "@ton/ton";
import { nanoToTonAmount, tonAmountToNano } from "@/lib/tonAmount";
import { resolveTonPriceResolution, type TonNetwork } from "@/lib/tonDeposits";

const DEFAULT_MAINNET_TONCENTER_URL = "https://toncenter.com/api/v2/jsonRPC";
const DEFAULT_TESTNET_TONCENTER_URL = "https://testnet.toncenter.com/api/v2/jsonRPC";

export type TonWithdrawalConfig = {
  enabled: boolean;
  ready: boolean;
  reason: "disabled" | "not_configured" | "ready";
  network: TonNetwork;
  endpoint: string;
  apiKey?: string;
  mnemonic?: string[];
  sourceAddress?: string;
  serviceFeePercent: string;
  networkFeeEstimateTon: string;
  networkFeeFloorTon: string;
  minAmountTon: string;
  maxAmountTon: string;
};

export type TonWithdrawalQuote = {
  network: TonNetwork;
  assetCode: "TON";
  serviceFeePercent: string;
  networkFeeEstimateTon: string;
  networkFeeReserveTon: string;
  minAmountTon: string;
  maxAmountTon: string;
  usdRate: string;
  rateProvider: string;
  rateSourceTimestamp: string | null;
  amountTon?: string;
  amountNano?: string;
  payoutUsd?: string;
  serviceFeeUsd?: string;
  networkFeeReserveUsd?: string;
  totalWalletDebitUsd?: string;
};

export class TonWithdrawalBroadcastError extends Error {
  readonly stage: "prepare" | "broadcast";

  constructor(message: string, stage: "prepare" | "broadcast") {
    super(message);
    this.name = "TonWithdrawalBroadcastError";
    this.stage = stage;
  }
}

export function loadTonWithdrawalConfig(): TonWithdrawalConfig {
  const enabled = process.env.TON_WITHDRAWAL_ENABLED?.trim().toLowerCase() === "true";
  const network: TonNetwork = process.env.TON_WITHDRAWAL_NETWORK?.trim() === "testnet" ? "testnet" : "mainnet";
  const endpoint = process.env.TON_WITHDRAWAL_TONCENTER_URL?.trim()
    || (network === "mainnet" ? DEFAULT_MAINNET_TONCENTER_URL : DEFAULT_TESTNET_TONCENTER_URL);
  const mnemonic = parseMnemonic(process.env.TON_WITHDRAWAL_MNEMONIC);
  const config = {
    enabled,
    ready: false,
    reason: "disabled" as TonWithdrawalConfig["reason"],
    network,
    endpoint,
    apiKey: process.env.TONCENTER_API_KEY?.trim() || undefined,
    mnemonic,
    sourceAddress: process.env.TON_WITHDRAWAL_SOURCE_ADDRESS?.trim() || undefined,
    serviceFeePercent: positiveConfiguredDecimal(process.env.TON_WITHDRAWAL_SERVICE_FEE_PERCENT, "1"),
    networkFeeEstimateTon: positiveConfiguredDecimal(process.env.TON_WITHDRAWAL_NETWORK_FEE_ESTIMATE_TON, "0.01"),
    networkFeeFloorTon: positiveConfiguredDecimal(process.env.TON_WITHDRAWAL_NETWORK_FEE_FLOOR_TON, "0.05"),
    minAmountTon: positiveConfiguredDecimal(process.env.TON_WITHDRAWAL_MIN_TON, "0.01"),
    maxAmountTon: positiveConfiguredDecimal(process.env.TON_WITHDRAWAL_MAX_TON, "1")
  } satisfies TonWithdrawalConfig;

  if (!enabled) return config;
  if (!mnemonic) return { ...config, reason: "not_configured" };
  return { ...config, ready: true, reason: "ready" };
}

export async function resolveTonWithdrawalQuote(config: TonWithdrawalConfig, amountTon?: string): Promise<TonWithdrawalQuote> {
  const resolution = await resolveTonPriceResolution(config.network);
  if (!resolution.snapshot) {
    throw new Error(resolution.failureReason === "provider_deviation"
      ? "TON price providers disagree. Try again later."
      : "TON withdrawal rate is temporarily unavailable.");
  }

  const networkFeeReserveTon = decimalString(Math.max(
    Number(config.networkFeeEstimateTon) * 2,
    Number(config.networkFeeFloorTon)
  ), 9);
  const quote: TonWithdrawalQuote = {
    network: config.network,
    assetCode: "TON",
    serviceFeePercent: config.serviceFeePercent,
    networkFeeEstimateTon: config.networkFeeEstimateTon,
    networkFeeReserveTon,
    minAmountTon: config.minAmountTon,
    maxAmountTon: config.maxAmountTon,
    usdRate: resolution.snapshot.rate,
    rateProvider: resolution.snapshot.provider,
    rateSourceTimestamp: resolution.snapshot.sourceTimestamp
  };

  if (!amountTon) return quote;
  const amountNano = tonAmountToNano(amountTon);
  if (!amountNano) throw new Error("Enter a positive TON amount with no more than 9 decimal places.");
  const normalizedAmountTon = nanoToTonAmount(amountNano);
  if (!normalizedAmountTon) throw new Error("Enter a valid TON amount.");
  const amount = Number(normalizedAmountTon);
  if (!Number.isFinite(amount) || amount < Number(config.minAmountTon) || amount > Number(config.maxAmountTon)) {
    throw new Error(`TON withdrawal amount must be between ${config.minAmountTon} and ${config.maxAmountTon} TON.`);
  }

  const payoutUsd = amount * Number(resolution.snapshot.rate);
  const serviceFeeUsd = payoutUsd * Number(config.serviceFeePercent) / 100;
  const networkFeeReserveUsd = Number(networkFeeReserveTon) * Number(resolution.snapshot.rate);
  return {
    ...quote,
    amountTon: normalizedAmountTon,
    amountNano,
    payoutUsd: decimalString(payoutUsd, 12),
    serviceFeeUsd: decimalString(serviceFeeUsd, 12),
    networkFeeReserveUsd: decimalString(networkFeeReserveUsd, 12),
    totalWalletDebitUsd: decimalString(payoutUsd + serviceFeeUsd + networkFeeReserveUsd, 12)
  };
}

export function normalizeTonWithdrawalAddress(value: unknown, network: TonNetwork): { raw: string; friendly: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const address = Address.parse(value.trim());
    if (address.workChain !== 0) return null;
    return {
      raw: address.toRawString(),
      friendly: address.toString({ bounceable: true, testOnly: network === "testnet" })
    };
  } catch {
    return null;
  }
}

export async function broadcastTonWithdrawal({
  config,
  amountTon,
  destinationAddress,
  comment
}: {
  config: TonWithdrawalConfig;
  amountTon: string;
  destinationAddress: string;
  comment: string;
}): Promise<{ sourceAddress: string; seqno: number; messageHash: string }> {
  if (!config.mnemonic) throw new TonWithdrawalBroadcastError("TON withdrawal signer is not configured.", "prepare");

  let sourceAddress = "";
  let seqno = 0;
  let transfer: Awaited<ReturnType<WalletContractV4["createTransfer"]>>;
  let contract: OpenedContract<WalletContractV4>;
  try {
    const keyPair = await mnemonicToPrivateKey(config.mnemonic);
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    sourceAddress = wallet.address.toString({ bounceable: true, testOnly: config.network === "testnet" });
    if (config.sourceAddress) {
      const configuredSource = normalizeTonWithdrawalAddress(config.sourceAddress, config.network);
      if (!configuredSource || configuredSource.raw !== wallet.address.toRawString()) {
        throw new Error("TON withdrawal source address does not match the configured signer.");
      }
    }

    const destination = normalizeTonWithdrawalAddress(destinationAddress, config.network);
    if (!destination) throw new Error("Enter a valid TON address.");
    if (destination.raw === wallet.address.toRawString()) throw new Error("Withdrawal address must differ from the operating wallet.");

    const client = new TonClient({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      timeout: 15_000
    });
    contract = client.open(wallet);
    seqno = await contract.getSeqno();
    transfer = await contract.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [internal({
        to: destination.raw,
        value: toNano(amountTon),
        body: comment
      })]
    });
  } catch (error) {
    throw new TonWithdrawalBroadcastError(error instanceof Error ? error.message : "Could not prepare TON transaction.", "prepare");
  }

  try {
    await contract.send(transfer);
  } catch (error) {
    throw new TonWithdrawalBroadcastError(error instanceof Error ? error.message : "TON broadcast status is unknown.", "broadcast");
  }
  return {
    sourceAddress,
    seqno,
    messageHash: transfer.hash().toString("hex")
  };
}

function parseMnemonic(value: string | undefined): string[] | undefined {
  const words = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  return words.length >= 12 ? words : undefined;
}

function positiveConfiguredDecimal(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() || fallback;
  return /^(?:\d+)(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0 ? normalized : fallback;
}

function decimalString(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "") || "0";
}
