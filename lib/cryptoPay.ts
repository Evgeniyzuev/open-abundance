import { readCryptoPayConfig, type CryptoPayConfig, type CryptoPayInvoice, invoiceMatches, type ExpectedInvoice } from "@/lib/cryptoPayCore";

export function loadCryptoPayConfig(): CryptoPayConfig {
  return readCryptoPayConfig(process.env);
}

async function call<T>(config: CryptoPayConfig, method: string, params: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${config.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Crypto-Pay-API-Token": config.token },
      body: JSON.stringify(params),
      cache: "no-store",
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; error?: { name?: string; code?: number } } | null;
    if (!response.ok || !payload?.ok || payload.result === undefined) {
      // Only the provider's error name is kept; the token and the request are never logged.
      throw new Error(`Crypto Pay ${method} failed: ${payload?.error?.name ?? `http_${response.status}`}`);
    }
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

/** A USD invoice that the person pays in USDT or TON; the provider converts, we credit the USD amount. */
export function createCryptoPayInvoice(config: CryptoPayConfig, input: { invoiceId: string; usdAmount: number; expiresInSeconds: number; description: string }): Promise<CryptoPayInvoice> {
  return call<CryptoPayInvoice>(config, "createInvoice", {
    currency_type: "fiat",
    fiat: "USD",
    accepted_assets: "USDT,TON",
    amount: input.usdAmount.toFixed(2),
    description: input.description,
    payload: input.invoiceId,
    allow_comments: false,
    allow_anonymous: false,
    expires_in: input.expiresInSeconds
  });
}

export async function getCryptoPayInvoice(config: CryptoPayConfig, providerInvoiceId: string): Promise<CryptoPayInvoice | null> {
  const result = await call<{ items?: CryptoPayInvoice[] } | CryptoPayInvoice[]>(config, "getInvoices", { invoice_ids: providerInvoiceId });
  const items = Array.isArray(result) ? result : result.items ?? [];
  return items.find((item) => String(item.invoice_id) === providerInvoiceId) ?? null;
}

export type SettleOutcome =
  | { settled: true; status: string; usdAmount: number; walletBalance: number | null }
  | { settled: false; reason: string };

/**
 * Asks the provider about the invoice (never trusting a webhook alone), checks that it is the invoice we
 * created and is fully paid, then settles it once in the database.
 */
export async function confirmAndSettle(db: any, config: CryptoPayConfig, row: { id: string; user_id: string; usd_amount: number | string; pay_usd_amount?: number | string | null; provider_invoice_id: string | null; status: string }): Promise<SettleOutcome> {
  if (!row.provider_invoice_id) return { settled: false, reason: "no_provider_invoice" };
  if (row.status === "credited" || row.status === "paid_test") return { settled: true, status: row.status, usdAmount: Number(row.usd_amount), walletBalance: null };
  // The provider invoice is for the grossed-up amount; the Wallet is credited the amount the person chose.
  const expected: ExpectedInvoice = { id: row.id, usdAmount: Number(row.pay_usd_amount ?? row.usd_amount), providerInvoiceId: row.provider_invoice_id };
  const remote = await getCryptoPayInvoice(config, row.provider_invoice_id);
  const match = invoiceMatches(remote, expected);
  if (!match.ok) {
    if (remote?.status === "expired" && row.status === "active") {
      await db.from("payment_provider_invoices").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "active");
    }
    return { settled: false, reason: match.reason };
  }
  const fee = remote?.fee_amount !== undefined ? Number(remote.fee_amount) : null;
  const { data, error } = await db.rpc("settle_payment_provider_invoice", {
    p_invoice_id: row.id,
    p_paid_asset: remote?.paid_asset ?? null,
    p_provider_fee: fee !== null && Number.isFinite(fee) ? fee : null,
    // Only the fields needed to audit the payment are kept.
    p_provider_payload: { invoice_id: remote?.invoice_id, status: remote?.status, amount: remote?.amount, fiat: remote?.fiat, paid_asset: remote?.paid_asset, paid_amount: remote?.paid_amount, fee_amount: remote?.fee_amount }
  });
  if (error) return { settled: false, reason: "settle_failed" };
  const result = Array.isArray(data) ? data[0] : data;
  return { settled: true, status: result?.invoice_status ?? "credited", usdAmount: Number(result?.usd_amount ?? row.usd_amount), walletBalance: result?.wallet_balance != null ? Number(result.wallet_balance) : null };
}
