import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type OfferRow = {
  id: string;
  proposer_user_id: string;
  target_user_id: string;
  target_listing_id: string;
  offered_listing_id: string;
  message: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

// The viewer's exchange offers, incoming and outgoing, with both listings and the other person.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const { data, error: offersError } = await supabase
      .from("marketplace_counter_offers" as never)
      .select("id,proposer_user_id,target_user_id,target_listing_id,offered_listing_id,message,status,created_at,expires_at")
      .or(`proposer_user_id.eq.${user.id},target_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (offersError) throw offersError;
    const offers = (data ?? []) as unknown as OfferRow[];
    if (!offers.length) return NextResponse.json({ offers: [] }, { headers: NO_STORE_HEADERS });

    const listingIds = Array.from(new Set(offers.flatMap((offer) => [offer.target_listing_id, offer.offered_listing_id])));
    const userIds = Array.from(new Set(offers.flatMap((offer) => [offer.proposer_user_id, offer.target_user_id])));
    const [listingsResult, profilesResult] = await Promise.all([
      supabase.from("marketplace_listings").select("id,title,price_amount,status").in("id", listingIds),
      supabase.from("user_profiles").select("user_id,display_name,username,level").in("user_id", userIds)
    ]);
    if (listingsResult.error) throw listingsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    const listings = new Map((listingsResult.data ?? []).map((listing) => [listing.id, listing]));
    const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile]));

    return NextResponse.json({
      offers: offers.map((offer) => {
        const incoming = offer.target_user_id === user.id;
        const other = profiles.get(incoming ? offer.proposer_user_id : offer.target_user_id) ?? null;
        return {
          id: offer.id,
          incoming,
          status: offer.status,
          message: offer.message,
          createdAt: offer.created_at,
          expiresAt: offer.expires_at,
          // "mine" is what the viewer gives; "theirs" is what the viewer receives.
          mine: listings.get(incoming ? offer.target_listing_id : offer.offered_listing_id) ?? null,
          theirs: listings.get(incoming ? offer.offered_listing_id : offer.target_listing_id) ?? null,
          other: other ? { userId: other.user_id, name: other.display_name || (other.username ? `@${other.username}` : null), level: other.level } : null
        };
      })
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load exchange offers." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// action: "create" (targetListingId, offeredListingId, message) | "accept" | "decline" | "cancel" (offerId)
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action;

    let result: { data: unknown; error: { message: string } | null };
    if (action === "create") {
      const targetListingId = uuid(body.targetListingId);
      const offeredListingId = uuid(body.offeredListingId);
      if (!targetListingId || !offeredListingId) return NextResponse.json({ error: "Both listings are required." }, { status: 400, headers: NO_STORE_HEADERS });
      const message = typeof body.message === "string" ? body.message.trim().slice(0, 280) : null;
      result = await (supabase as any).rpc("create_marketplace_counter_offer", {
        p_proposer_user_id: user.id,
        p_target_listing_id: targetListingId,
        p_offered_listing_id: offeredListingId,
        p_message: message
      });
    } else if (action === "accept" || action === "decline" || action === "cancel") {
      const offerId = uuid(body.offerId);
      if (!offerId) return NextResponse.json({ error: "Offer id is required." }, { status: 400, headers: NO_STORE_HEADERS });
      result = await (supabase as any).rpc("respond_marketplace_counter_offer", { p_offer_id: offerId, p_actor_user_id: user.id, p_action: action });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (result.error) {
      // Business failures raised inside the transaction (for example "Exchange failed: ...") are user errors.
      const status = /^Exchange failed:/.test(result.error.message) ? 400 : 500;
      return NextResponse.json({ error: result.error.message }, { status, headers: NO_STORE_HEADERS });
    }
    const data = result.data as { error?: string } | null;
    if (data?.error) return NextResponse.json({ error: data.error }, { status: 400, headers: NO_STORE_HEADERS });
    return NextResponse.json({ offer: data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update exchange offer." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
