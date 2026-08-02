import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const SELECT = "id,user_id,network,asset_code,master_address,destination_address,normalized_destination_address,amount_units,amount_usdt,usdt_usd_rate,usdt_rate_provider,usdt_rate_source_timestamp,ton_usd_rate,ton_rate_provider,ton_rate_source_timestamp,payout_wallet_amount,service_fee_percent,service_fee_amount,network_fee_estimate_ton,network_fee_reserve_ton,network_fee_reserve_amount,total_reserved_amount,status,idempotency_key,source_address,seqno,message_hash,transaction_hash,error_code,error_message,refunded_at,broadcast_at,confirmed_at,created_at,updated_at";
function jsonResponse(body: unknown, init?: ResponseInit) { return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } }); }
export async function GET(request: NextRequest, { params }: { params: { withdrawalId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });
    const db = supabase as any;
    const { data: withdrawal, error: withdrawalError } = await db.from("ton_usdt_withdrawals").select(SELECT).eq("id", params.withdrawalId).eq("user_id", user.id).maybeSingle();
    if (withdrawalError) return jsonResponse({ error: withdrawalError.message }, { status: 500 });
    if (!withdrawal) return jsonResponse({ error: "TON USDT withdrawal not found." }, { status: 404 });
    const fields = ["amount_units", "amount_usdt", "usdt_usd_rate", "ton_usd_rate", "payout_wallet_amount", "service_fee_percent", "service_fee_amount", "network_fee_estimate_ton", "network_fee_reserve_ton", "network_fee_reserve_amount", "total_reserved_amount"];
    const result = fields.reduce((value, field) => ({ ...value, [field]: numericString(withdrawal[field]) }), { ...withdrawal });
    return jsonResponse({ withdrawal: result });
  } catch (routeError) { return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Could not load TON USDT withdrawal." }, { status: 500 }); }
}
function numericString(value: unknown): string | null { const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null; }