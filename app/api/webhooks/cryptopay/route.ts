import { NextRequest, NextResponse } from "next/server";
import { confirmAndSettle, loadCryptoPayConfig } from "@/lib/cryptoPay";
import { verifyCryptoPaySignature, webhookIsFresh } from "@/lib/cryptoPayCore";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

/**
 * POST /api/webhooks/cryptopay
 *
 * Crypto Pay calls this when an invoice is paid. The body must carry a valid signature; even then the
 * payment is confirmed by asking the provider again (confirmAndSettle), never taken from the webhook.
 * A valid but unknown or unpaid update gets 200 so the provider stops retrying; a bad signature gets 401.
 */
export async function POST(request: NextRequest) {
  const config = loadCryptoPayConfig();
  if (!config.ready) return respond({ error: "Not configured." }, 503);

  const rawBody = await request.text();
  if (!verifyCryptoPaySignature(rawBody, request.headers.get("crypto-pay-api-signature"), config.token)) {
    return respond({ error: "Invalid signature." }, 401);
  }

  let update: { update_type?: string; request_date?: unknown; payload?: { invoice_id?: number | string } };
  try { update = JSON.parse(rawBody); } catch { return respond({ error: "Invalid body." }, 400); }
  if (update.update_type !== "invoice_paid") return respond({ ok: true, ignored: true });
  if (!webhookIsFresh(update.request_date, Date.now())) return respond({ ok: true, ignored: "stale" });

  const providerInvoiceId = update.payload?.invoice_id !== undefined ? String(update.payload.invoice_id) : null;
  if (!providerInvoiceId) return respond({ ok: true, ignored: true });

  const db = createServiceSupabaseClient() as any;
  const { data: row } = await db.from("payment_provider_invoices")
    .select("id,user_id,usd_amount,provider_invoice_id,status")
    .eq("provider", "cryptopay").eq("network", config.network).eq("provider_invoice_id", providerInvoiceId).maybeSingle();
  if (!row) return respond({ ok: true, ignored: "unknown_invoice" });

  try {
    const outcome = await confirmAndSettle(db, config, row);
    return respond({ ok: true, settled: outcome.settled });
  } catch {
    // The provider will retry; the person's status poll also re-checks.
    return respond({ error: "Could not confirm the payment yet." }, 502);
  }
}
