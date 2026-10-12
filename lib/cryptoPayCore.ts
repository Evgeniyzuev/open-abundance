// Pure parts of the Crypto Pay integration (tested directly by node): webhook signature, freshness and the
// check that the invoice the provider reports is the one we created. No network and no database here.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type CryptoPayInvoice = {
  invoice_id: number;
  status: string;
  currency_type?: string;
  fiat?: string;
  asset?: string;
  amount: string;
  payload?: string;
  paid_asset?: string;
  paid_amount?: string;
  fee_amount?: string | number;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
  pay_url?: string;
  expiration_date?: string;
};

/**
 * The signature is HMAC-SHA256 of the raw request body, keyed with the SHA-256 of the app token, sent
 * hex-encoded in the `crypto-pay-api-signature` header. The comparison is constant-time.
 */
export function verifyCryptoPaySignature(rawBody: string, signature: string | null | undefined, token: string): boolean {
  if (!signature || !token) return false;
  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length || !/^[0-9a-f]+$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

/** A webhook older than this is ignored (a replayed request); settlement is idempotent anyway. */
export function webhookIsFresh(requestDate: unknown, nowMs: number, maxAgeMs = 15 * 60_000): boolean {
  const time = typeof requestDate === "string" || typeof requestDate === "number" ? Date.parse(String(requestDate)) : NaN;
  const value = Number.isFinite(time) ? time : typeof requestDate === "number" ? requestDate * 1000 : NaN;
  return Number.isFinite(value) && Math.abs(nowMs - value) <= maxAgeMs;
}

export type ExpectedInvoice = { id: string; usdAmount: number; providerInvoiceId: string };

/** The provider's own record must say: paid, in USD terms, exactly our amount, carrying our invoice id. */
export function invoiceMatches(provider: CryptoPayInvoice | null | undefined, expected: ExpectedInvoice): { ok: true } | { ok: false; reason: string } {
  if (!provider) return { ok: false, reason: "not_found" };
  if (String(provider.invoice_id) !== expected.providerInvoiceId) return { ok: false, reason: "invoice_id_mismatch" };
  if (provider.status !== "paid") return { ok: false, reason: `status_${provider.status}` };
  if (provider.currency_type !== "fiat" || provider.fiat !== "USD") return { ok: false, reason: "not_usd" };
  if (!(Math.abs(Number(provider.amount) - expected.usdAmount) < 0.005)) return { ok: false, reason: "amount_mismatch" };
  if (provider.payload !== expected.id) return { ok: false, reason: "payload_mismatch" };
  return { ok: true };
}

export type CryptoPayConfig = {
  ready: boolean;
  reason?: "disabled" | "missing_token";
  network: "mainnet" | "testnet";
  token: string;
  baseUrl: string;
  minUsd: number;
  maxUsd: number;
  dailyUsd: number;
  /** The share the provider keeps; added to the invoice so the project bears no cost. */
  feePercent: number;
};

const clean = (value: string | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function readCryptoPayConfig(env: Record<string, string | undefined>): CryptoPayConfig {
  // The test network is the default: it can never credit a Wallet (enforced again in the database).
  const network = clean(env.CRYPTO_PAY_NETWORK).toLowerCase() === "mainnet" ? "mainnet" : "testnet";
  const token = clean(env.CRYPTO_PAY_TOKEN);
  const enabled = clean(env.CRYPTO_PAY_ENABLED).toLowerCase() === "true";
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(clean(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    ready: enabled && Boolean(token),
    reason: !enabled ? "disabled" : !token ? "missing_token" : undefined,
    network,
    token,
    baseUrl: network === "mainnet" ? "https://pay.crypt.bot/api" : "https://testnet-pay.crypt.bot/api",
    minUsd: number(env.CRYPTO_PAY_MIN_USD, 1),
    maxUsd: number(env.CRYPTO_PAY_MAX_USD, 50),
    dailyUsd: number(env.CRYPTO_PAY_DAILY_USD, 100),
    // Measured on the test network: 0.150 of 5.005 paid, 3.0%.
    feePercent: Math.min(number(env.CRYPTO_PAY_FEE_PERCENT, 3), 20)
  };
}

/** A whole-cent USD amount inside the limits, or null. */
export function parseUsdAmount(value: unknown, minUsd: number, maxUsd: number): number | null {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount * 100) / 100;
  return Math.abs(rounded - amount) < 1e-9 && rounded >= minUsd && rounded <= maxUsd ? rounded : null;
}
