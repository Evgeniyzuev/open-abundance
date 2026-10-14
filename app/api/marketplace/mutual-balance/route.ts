import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// The owner's mutual balance: Marketplace purchases minus sales, last 90 days and all time.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const { data, error: rpcError } = await (supabase as any).rpc("mutual_balance", { p_user_id: user.id, p_window_days: 90 });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ mutualBalance: data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load the mutual balance." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
