import { NextRequest, NextResponse } from "next/server";
import { confirmAndSettle, createCryptoPayInvoice, loadCryptoPayConfig } from "@/lib/cryptoPay";
import { parseUsdAmount } from "@/lib/cryptoPayCore";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const INVOICE_TTL_SECONDS = 3600;
const MAX_OPEN_INVOICES = 3;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

/**
 * GET  /api/wallet/deposits/cryptopay            availability and limits (for the deposit menu)
 * GET  /api/wallet/deposits/cryptopay?id=<uuid>  status of one invoice; an open invoice is re-checked with the provider
 * POST /api/wallet/deposits/cryptopay            { amount } creates a USD invoice the person pays in CryptoBot
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const config = loadCryptoPayConfig();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return json({ enabled: config.ready, network: config.network, minUsd: config.minUsd, maxUsd: config.maxUsd, dailyUsd: config.dailyUsd });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: "Invalid invoice id." }, 400);

  const db = supabase as any;
  const { data: row } = await db.from("payment_provider_invoices").select("id,user_id,usd_amount,provider_invoice_id,status,network,expires_at,paid_asset").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return json({ error: "Invoice not found." }, 404);

  let status: string = row.status;
  if (status === "active" && config.ready && config.network === row.network) {
    try {
      const outcome = await confirmAndSettle(db, config, row);
      if (outcome.settled) status = outcome.status;
      else if (outcome.reason === "status_expired") status = "expired";
    } catch {
      // A provider hiccup is not an error for the person: the next check will ask again.
    }
  }
  if (status === "active" && Date.parse(row.expires_at) < Date.now()) status = "expired";
  return json({ invoice: { id: row.id, status, usdAmount: Number(row.usd_amount), network: row.network, expiresAt: row.expires_at } });
}

export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const config = loadCryptoPayConfig();
  if (!config.ready) return json({ error: "CryptoBot top-up is not available yet.", reason: config.reason }, 503);

  const body = (await request.json().catch(() => null)) as { amount?: unknown } | null;
  const usdAmount = parseUsdAmount(body?.amount, config.minUsd, config.maxUsd);
  if (usdAmount === null) return json({ error: "Amount is outside the allowed range.", minUsd: config.minUsd, maxUsd: config.maxUsd }, 400);

  const db = supabase as any;
  // Limits: a few open invoices at a time and a daily cap per person (paid and open invoices both count).
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const { data: recent } = await db.from("payment_provider_invoices").select("status,usd_amount,expires_at")
    .eq("user_id", user.id).eq("provider", "cryptopay").eq("network", config.network).gte("created_at", dayStart.toISOString());
  const rows: Array<{ status: string; usd_amount: number | string; expires_at: string }> = recent ?? [];
  const open = rows.filter((row) => row.status === "active" && Date.parse(row.expires_at) > Date.now()).length;
  if (open >= MAX_OPEN_INVOICES) return json({ error: "Too many open invoices. Pay or wait for them to expire.", code: "too_many_open" }, 429);
  const dayTotal = rows.filter((row) => row.status !== "expired" && row.status !== "failed").reduce((sum, row) => sum + Number(row.usd_amount), 0);
  if (dayTotal + usdAmount > config.dailyUsd) return json({ error: "Daily top-up limit reached.", code: "daily_limit", dailyUsd: config.dailyUsd }, 429);

  const id = crypto.randomUUID();
  try {
    const invoice = await createCryptoPayInvoice(config, { invoiceId: id, usdAmount, expiresInSeconds: INVOICE_TTL_SECONDS, description: "Open Abundance Wallet top-up" });
    const payUrl = invoice.bot_invoice_url ?? invoice.pay_url ?? null;
    const expiresAt = new Date(Date.now() + INVOICE_TTL_SECONDS * 1000).toISOString();
    const { error: insertError } = await db.from("payment_provider_invoices").insert({
      id, user_id: user.id, provider: "cryptopay", network: config.network, provider_invoice_id: String(invoice.invoice_id),
      status: "active", usd_amount: usdAmount, pay_url: payUrl, expires_at: expiresAt, idempotency_key: id
    });
    if (insertError) return json({ error: "Could not save the invoice." }, 500);
    return json({ invoice: { id, usdAmount, payUrl, miniAppUrl: invoice.mini_app_invoice_url ?? null, expiresAt, network: config.network } }, 201);
  } catch (providerError) {
    // The provider's error name (for example UNAUTHORIZED) is safe to show; the token and request never are.
    const reason = providerError instanceof Error ? providerError.message.split(": ").pop() ?? "unknown" : "unknown";
    console.error("Crypto Pay createInvoice failed:", reason);
    return json({ error: "The payment provider is unavailable. Try again in a moment.", providerError: reason }, 502);
  }
}
