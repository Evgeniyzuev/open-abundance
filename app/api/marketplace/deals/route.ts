import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { productKeyOf } from "@/lib/oaProducts";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

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
    const dealIds = uniqueDeals.map((deal: any) => deal.id);
    const { data: events, error: eventsError } = dealIds.length
      ? await (supabase as any)
          .from("marketplace_deal_events")
          .select("id,deal_id,actor_user_id,actor_type,event_type,metadata,created_at")
          .in("deal_id", dealIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500, headers: NO_STORE_HEADERS });
    const eventsByDeal = new Map<string, any[]>();
    for (const event of events ?? []) {
      const list = eventsByDeal.get(event.deal_id) ?? [];
      list.push(event);
      eventsByDeal.set(event.deal_id, list);
    }
    // The listing title, and the product key of an Open Abundance product so the buyer gets an "Open the product" link.
    const listingIds = Array.from(new Set(uniqueDeals.map((deal: any) => deal.listing_id).filter(Boolean)));
    const { data: listingRows } = listingIds.length
      ? await (supabase as any).from("marketplace_listings").select("id,title,metadata").in("id", listingIds)
      : { data: [] };
    const listingById = new Map<string, any>((listingRows ?? []).map((row: any) => [row.id, row]));
    const dealsWithEvents = uniqueDeals.map((deal: any) => {
      const listing = listingById.get(deal.listing_id);
      return { ...deal, listing_title: listing?.title ?? null, product_key: productKeyOf(listing?.metadata), events: eventsByDeal.get(deal.id) ?? [] };
    });

    return NextResponse.json(
      {
        deals: dealsWithEvents,
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
    const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 200) : null;

    if (!listingId) {
      return NextResponse.json({ error: "Listing ID is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: "Idempotency key is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: result, error: rpcError } = await (supabase as any).rpc("create_marketplace_deal_with_key", {
      p_idempotency_key: idempotencyKey,
      p_listing_id: listingId,
      p_buyer_user_id: user.id
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
    }

    await autoServeOaProduct(result?.deal_id, result?.idempotent === true);

    return NextResponse.json({ deal: result }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create deal." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * A deal on an Open Abundance product (a listing of the OA account with a product key) is accepted and delivered at
 * once: the text is digital, so nobody has to wait for the seller. The buyer still confirms or disputes as usual.
 * Any failure leaves the deal as it is for manual handling.
 */
async function autoServeOaProduct(dealId: unknown, idempotent: boolean): Promise<void> {
  const sellerId = process.env.OA_SELLER_USER_ID?.trim();
  if (!sellerId || !isUuid(sellerId) || !isUuid(dealId) || idempotent) return;
  try {
    const db = createServiceSupabaseClient() as any;
    const { data: deal } = await db.from("marketplace_deals").select("seller_user_id,listing_id").eq("id", dealId).maybeSingle();
    if (!deal || deal.seller_user_id !== sellerId) return;
    const { data: listing } = await db.from("marketplace_listings").select("metadata").eq("id", deal.listing_id).maybeSingle();
    if (!productKeyOf(listing?.metadata)) return;
    const accepted = await db.rpc("accept_marketplace_deal", { p_deal_id: dealId, p_actor_user_id: sellerId });
    if (accepted.error || accepted.data?.error) return;
    await db.rpc("deliver_marketplace_deal", { p_deal_id: dealId, p_actor_user_id: sellerId });
    // A product is sold in any number of copies: the listing stays open for the next buyer.
    await db.from("marketplace_listings").update({ status: "active" }).eq("id", deal.listing_id).in("status", ["reserved", "sold"]);
  } catch {
    // The deal stays awaiting the seller.
  }
}
