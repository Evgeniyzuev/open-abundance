import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildTonUsdtTransferLink } from "@/lib/tonUsdt";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
function jsonResponse(body: unknown, init?: ResponseInit) { return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } }); }

export async function GET(request: NextRequest, { params }: { params: { depositId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });
    const db = supabase as any;
    const { data: invoice, error: invoiceError } = await db.from("ton_usdt_deposit_invoices").select("id,user_id,network,asset_code,master_address,invoice_code,deposit_owner_address,deposit_jetton_wallet_address,expected_amount_units,status,expires_at,created_at,updated_at").eq("id", params.depositId).eq("user_id", user.id).maybeSingle();
    if (invoiceError) return jsonResponse({ error: invoiceError.message }, { status: 500 });
    if (!invoice) return jsonResponse({ error: "TON USDT invoice not found." }, { status: 404 });
    const { data: events, error: eventError } = await db.from("ton_usdt_chain_events").select("id,transaction_hash,logical_time,amount_units,status,rejection_reason,settled_usd_amount,settled_at,usdt_usd_rate,rate_provider,finalized_at,created_at").eq("invoice_code", invoice.invoice_code).order("created_at", { ascending: false });
    if (eventError) return jsonResponse({ error: eventError.message }, { status: 500 });
    return jsonResponse({ invoice: { ...invoice, expected_amount_units: numericString(invoice.expected_amount_units), comment: invoice.invoice_code, decimals: 6, transferLink: buildTonUsdtTransferLink(invoice.deposit_owner_address, invoice.master_address, numericString(invoice.expected_amount_units), invoice.invoice_code) }, events: (events ?? []).map((event: Record<string, any>) => ({ ...event, amount_units: numericString(event.amount_units), settled_usd_amount: numericString(event.settled_usd_amount), usdt_usd_rate: numericString(event.usdt_usd_rate) })) });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Could not load TON USDT invoice." }, { status: 500 });
  }
}
function numericString(value: unknown): string | null { const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null; }