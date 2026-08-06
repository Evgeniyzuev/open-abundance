import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type Action = "accept" | "cancel" | "deliver" | "confirm" | "dispute" | "review";

export async function handleMarketplaceDealAction(request: NextRequest, dealId: string, action: Action) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (!/^[0-9a-f-]{36}$/i.test(dealId)) return NextResponse.json({ error: "Invalid deal ID." }, { status: 400, headers: NO_STORE_HEADERS });
    const body = await request.json().catch(() => ({}));
    const rpc = action === "accept"
      ? "accept_marketplace_deal"
      : action === "cancel"
        ? "cancel_marketplace_deal"
        : action === "deliver"
          ? "deliver_marketplace_deal"
          : action === "confirm"
            ? "confirm_marketplace_deal"
            : action === "dispute"
              ? "dispute_marketplace_deal"
              : "create_marketplace_review";
    const rating = Number(body.rating);
    const args = action === "review"
      ? { p_deal_id: dealId, p_buyer_user_id: user.id, p_rating: rating, p_review_text: typeof body.reviewText === "string" ? body.reviewText : "" }
      : action === "dispute"
        ? { p_deal_id: dealId, p_actor_user_id: user.id, p_reason: typeof body.reason === "string" ? body.reason : "" }
        : { p_deal_id: dealId, p_actor_user_id: user.id };
    if (action === "review" && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { data, error: rpcError } = await (supabase as any).rpc(rpc, args);
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if ((data as any)?.error) return NextResponse.json({ error: (data as any).error }, { status: 400, headers: NO_STORE_HEADERS });
    return NextResponse.json({ [action === "review" ? "review" : "deal"]: data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to process marketplace deal." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
