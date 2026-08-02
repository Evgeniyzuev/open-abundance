import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const WITHDRAWAL_SELECT = "id,user_id,network,asset_code,destination_address,normalized_destination_address,amount_nano,amount_ton,ton_usd_rate,rate_provider,rate_source_timestamp,payout_wallet_amount,service_fee_percent,service_fee_amount,network_fee_estimate_ton,network_fee_reserve_ton,network_fee_reserve_amount,total_reserved_amount,status,idempotency_key,source_address,seqno,message_hash,transaction_hash,error_code,error_message,refunded_at,broadcast_at,confirmed_at,created_at,updated_at";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers
    }
  });
}

export async function GET(request: NextRequest, { params }: { params: { withdrawalId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("ton_withdrawals")
      .select(WITHDRAWAL_SELECT)
      .eq("id", params.withdrawalId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (withdrawalError) return jsonResponse({ error: withdrawalError.message }, { status: 500 });
    if (!withdrawal) return jsonResponse({ error: "TON withdrawal not found." }, { status: 404 });

    return jsonResponse({
      withdrawal: {
        ...withdrawal,
        amount_nano: numericString(withdrawal.amount_nano),
        amount_ton: numericString(withdrawal.amount_ton),
        ton_usd_rate: numericString(withdrawal.ton_usd_rate),
        payout_wallet_amount: numericString(withdrawal.payout_wallet_amount),
        service_fee_percent: numericString(withdrawal.service_fee_percent),
        service_fee_amount: numericString(withdrawal.service_fee_amount),
        network_fee_estimate_ton: numericString(withdrawal.network_fee_estimate_ton),
        network_fee_reserve_ton: numericString(withdrawal.network_fee_reserve_ton),
        network_fee_reserve_amount: numericString(withdrawal.network_fee_reserve_amount),
        total_reserved_amount: numericString(withdrawal.total_reserved_amount)
      }
    });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Could not load TON withdrawal." }, { status: 500 });
  }
}

function numericString(value: unknown): string | null {
  const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}
