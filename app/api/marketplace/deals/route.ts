import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
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

    const [sellingResult, buyingResult] = await Promise.all([
      (supabase as any)
        .from("marketplace_deals")
        .select("*")
        .eq("seller_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      (supabase as any)
        .from("marketplace_deals")
        .select("*")
        .eq("buyer_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30)
    ]);

    if (sellingResult.error) {
      return NextResponse.json({ error: sellingResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (buyingResult.error) {
      return NextResponse.json({ error: buyingResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const allDeals = [...(sellingResult.data ?? []), ...(buyingResult.data ?? [])];
    const uniqueDeals = Array.from(new Map(allDeals.map((d: any) => [d.id, d])).values());

    return NextResponse.json(
      {
        deals: uniqueDeals,
        selling: sellingResult.data ?? [],
        buying: buyingResult.data ?? []
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load deals." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await request.json().catch(() => ({}));
    const listingId = typeof body.listingId === "string" && /^[0-9a-f-]{36}$/i.test(body.listingId) ? body.listingId : null;

    if (!listingId) {
      return NextResponse.json({ error: "Listing ID is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: result, error: rpcError } = await (supabase as any).rpc("create_marketplace_deal", {
      p_listing_id: listingId,
      p_buyer_user_id: user.id
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ deal: result }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create deal." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}