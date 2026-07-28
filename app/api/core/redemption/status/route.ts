import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data, error: queryError } = await (supabase as any)
      .from("core_redemption_requests")
      .select("id,core_balance_before,amount,network,payout_address,status,idempotency_key,tx_hash,attempt_count,last_error,address_confirmed_at,cooling_until,reserved_at,kyc_status,aml_status,requested_at,processing_at,paid_at,updated_at,breach_obligation_id")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false });

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ requests: data ?? [] }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Could not load Core redemption status." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
