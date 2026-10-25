import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { confirmAndSettle, loadCryptoPayConfig } from "@/lib/cryptoPay";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const BATCH = 50;
/** A paid invoice can be reported a little after its deadline, so the provider is still asked for a while. */
const LATE_PAYMENT_GRACE_MS = 60 * 60_000;

/** Outcomes of an invoice the provider reports as paid that still could not be credited automatically. */
const NEEDS_REVIEW = new Set(["invoice_id_mismatch", "not_usd", "amount_mismatch", "payload_mismatch", "settle_failed"]);

type Row = { id: string; user_id: string; usd_amount: number | string; pay_usd_amount: number | string | null; provider_invoice_id: string | null; status: string; network: string; expires_at: string };

/**
 * POST /api/internal/payments/reconcile
 *
 * Called by pg_cron every 5 minutes while provider invoices are open (supabase/migrations/20261025190000). A safety net
 * for the webhook: each open invoice is asked about again and settled once when paid; invoices past their deadline are
 * marked expired. Settling is idempotent, so a webhook and this check never credit twice.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TON_SCANNER_SECRET?.trim();
  const provided = request.headers.get("x-ton-scanner-secret")?.trim() ?? "";
  if (!expected || !safeEqual(provided, expected)) return json({ error: "Unauthorized." }, 401);

  const config = loadCryptoPayConfig();
  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db.from("payment_provider_invoices")
    .select("id,user_id,usd_amount,pay_usd_amount,provider_invoice_id,status,network,expires_at")
    .eq("provider", "cryptopay").eq("status", "active").order("created_at", { ascending: true }).limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  const summary = { checked: 0, credited: 0, expired: 0, open: 0, review: 0, errors: 0 };
  const now = Date.now();
  for (const row of (data ?? []) as Row[]) {
    summary.checked += 1;
    const deadline = Date.parse(row.expires_at);
    // The provider is asked only for invoices of the network we are connected to; others can only run out.
    if (config.ready && config.network === row.network && now < deadline + LATE_PAYMENT_GRACE_MS) {
      try {
        const outcome = await confirmAndSettle(db, config, row);
        if (outcome.settled) { summary.credited += 1; continue; }
        if (outcome.reason === "status_expired") { summary.expired += 1; continue; }
        if (NEEDS_REVIEW.has(outcome.reason)) {
          // Paid at the provider but not as we expect, or the credit failed: a person looks, nothing expires it.
          await db.from("payment_provider_invoices").update({ status: "manual_review", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "active");
          summary.review += 1;
          continue;
        }
      } catch {
        summary.errors += 1;
        continue;
      }
    }
    if (now > deadline + (config.ready && config.network === row.network ? LATE_PAYMENT_GRACE_MS : 0)) {
      await db.from("payment_provider_invoices").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "active");
      summary.expired += 1;
    } else {
      summary.open += 1;
    }
  }
  return json(summary, 200);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
