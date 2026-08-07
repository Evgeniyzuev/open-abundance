import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest) {
  const expected = process.env.ECONOMY_INTERNAL_SECRET;
  const supplied = request.headers.get("x-economy-internal-secret");
  if (!expected || !supplied || expected !== supplied) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({})) as { userId?: unknown };
  if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
    return NextResponse.json({ error: "A valid userId is required." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { data: rebuild, error: rebuildError } = await supabase.rpc("rebuild_user_economy_metrics", { p_user_id: body.userId });
    if (rebuildError) return NextResponse.json({ error: rebuildError.message }, { status: 500, headers: NO_STORE_HEADERS });
    const { data: reconciliation, error: reconciliationError } = await supabase.rpc("reconcile_user_economy_metrics", { p_user_id: body.userId });
    if (reconciliationError) return NextResponse.json({ error: reconciliationError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ rebuild, reconciliation }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to reconcile economy metrics." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
