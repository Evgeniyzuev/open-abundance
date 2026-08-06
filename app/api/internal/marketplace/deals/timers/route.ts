import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE_HEADERS });
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await (supabase as any).rpc("process_marketplace_deal_timers", { p_limit: 50 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ processed: data ?? 0 }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to process marketplace timers." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.MARKETPLACE_INTERNAL_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers.get("x-marketplace-internal-secret") || request.headers.get("x-cron-secret");
  return Boolean(expected && supplied && expected === supplied);
}
