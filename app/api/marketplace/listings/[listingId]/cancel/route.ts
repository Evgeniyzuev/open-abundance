import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type RouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { listingId } = await context.params;
    if (!isUuid(listingId)) {
      return NextResponse.json({ error: "Invalid listing id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: listing, error: listingError } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("id", listingId)
      .eq("seller_user_id", user.id)
      .maybeSingle();

    if (listingError) {
      return NextResponse.json({ error: listingError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (listing.status !== "active" && listing.status !== "draft") {
      return NextResponse.json({ error: "Only draft or active listings can be cancelled." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: cancelledListing, error: updateError } = await supabase
      .from("marketplace_listings")
      .update({
        cancelled_at: new Date().toISOString(),
        status: "cancelled"
      })
      .eq("id", listing.id)
      .eq("seller_user_id", user.id)
      .in("status", ["active", "draft"])
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ listing: cancelledListing }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to cancel marketplace listing." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
