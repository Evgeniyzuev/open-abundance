import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest, { params }: { params: { dealId: string } }) {
  const expected = process.env.MARKETPLACE_INTERNAL_SECRET;
  const supplied = request.headers.get("x-marketplace-internal-secret");
  if (!expected || !supplied || expected !== supplied) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE_HEADERS });
  if (!/^[0-9a-f-]{36}$/i.test(params.dealId)) return NextResponse.json({ error: "Invalid deal id." }, { status: 400, headers: NO_STORE_HEADERS });
  try {
    const body = await request.json().catch(() => ({}));
    const resolution = body.resolution === "release_to_seller" || body.resolution === "refund_buyer" ? body.resolution : null;
    if (!resolution) return NextResponse.json({ error: "Resolution must be release_to_seller or refund_buyer." }, { status: 400, headers: NO_STORE_HEADERS });
    const supabase = createServiceSupabaseClient();
    const { data, error } = await (supabase as any).rpc("resolve_marketplace_dispute", { p_deal_id: params.dealId, p_resolution: resolution });
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if ((data as any)?.error) return NextResponse.json({ error: (data as any).error }, { status: 400, headers: NO_STORE_HEADERS });
    return NextResponse.json({ deal: data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to resolve marketplace dispute." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
