import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildTonUsdtTransferLink, loadTonUsdtConfig, parseTonUsdtUnits } from "@/lib/tonUsdt";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const VISIBLE_STATUSES = ["waiting", "detected", "finalizing", "confirmed_pending_credit", "awaiting_rate", "credited", "credited_late", "credited_amount_mismatch", "unmatched", "cancelled", "expired"];

type CreateDepositBody = { expectedAmountUsdt?: unknown; replaceActive?: unknown };
function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } });
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });
    const config = await loadTonUsdtConfig(supabase as any);
    if (!config?.ready) return jsonResponse({ error: "TON USDT deposit is not configured yet.", reason: config?.reason ?? "disabled" }, { status: 503 });
    const body = (await request.json().catch(() => ({}))) as CreateDepositBody;
    const expectedAmountUnits = body.expectedAmountUsdt === undefined || body.expectedAmountUsdt === null || body.expectedAmountUsdt === ""
      ? null
      : parseTonUsdtUnits(body.expectedAmountUsdt, config.decimals);
    if (body.expectedAmountUsdt !== undefined && body.expectedAmountUsdt !== null && body.expectedAmountUsdt !== "" && !expectedAmountUnits) {
      return jsonResponse({ error: "Expected USDT amount must be positive with no more than 6 decimal places." }, { status: 400 });
    }
    const invoiceCode = `oa_usdt_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    const db = supabase as any;
    const { data: rows, error: createError } = await db.rpc("create_or_reuse_ton_usdt_deposit_invoice", {
      p_user_id: user.id,
      p_network: config.network,
      p_master_address: config.masterAddress,
      p_invoice_code: invoiceCode,
      p_deposit_owner_address: config.depositOwnerAddress,
      p_deposit_jetton_wallet_address: config.depositJettonWalletAddress,
      p_expected_amount_units: expectedAmountUnits,
      p_expires_at: expiresAt,
      p_replace_active: body.replaceActive === true
    });
    const invoice = rows?.[0];
    if (createError || !invoice) return jsonResponse({ error: createError?.message ?? "Failed to create TON USDT invoice." }, { status: 500 });
    return jsonResponse({ invoice: presentInvoice(invoice, config.decimals), reused: invoice.reused }, { status: invoice.reused ? 200 : 201 });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to create TON USDT invoice." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });
    const activeOnly = request.nextUrl.searchParams.get("active") === "true";
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const db = supabase as any;
    let query = db.from("ton_usdt_deposit_invoices").select("id,user_id,network,asset_code,master_address,invoice_code,deposit_owner_address,deposit_jetton_wallet_address,expected_amount_units,status,expires_at,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(activeOnly ? 1 : limit);
    if (activeOnly) query = query.in("status", VISIBLE_STATUSES);
    const { data: invoices, error: invoicesError } = await query;
    if (invoicesError) return jsonResponse({ error: invoicesError.message }, { status: 500 });
    if (!activeOnly) return jsonResponse({ invoices: invoices ?? [] });
    const invoice = invoices?.[0] ?? null;
    const { data: event, error: eventError } = invoice
      ? await db.from("ton_usdt_chain_events").select("transaction_hash,amount_units,status,rejection_reason,settled_usd_amount,settled_at,usdt_usd_rate,rate_provider,finalized_at").eq("invoice_code", invoice.invoice_code).order("settled_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null, error: null };
    if (eventError) return jsonResponse({ error: eventError.message }, { status: 500 });
    return jsonResponse({ invoice: invoice ? presentInvoice(invoice, 6) : null, event: event ? presentEvent(event) : null });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to load TON USDT deposits." }, { status: 500 });
  }
}

function presentInvoice(invoice: Record<string, any>, decimals: number) {
  const expected = numericString(invoice.expected_amount_units);
  return { ...invoice, expected_amount_units: expected, comment: invoice.invoice_code, transferLink: buildTonUsdtTransferLink(invoice.deposit_owner_address, invoice.master_address, expected, invoice.invoice_code), decimals };
}
function presentEvent(event: Record<string, any>) {
  return { ...event, amount_units: numericString(event.amount_units), settled_usd_amount: numericString(event.settled_usd_amount), usdt_usd_rate: numericString(event.usdt_usd_rate) };
}
function numericString(value: unknown): string | null {
  const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}
function clampLimit(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.floor(parsed))) : 20;
}