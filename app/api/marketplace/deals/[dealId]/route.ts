import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest, { params }: { params: { dealId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const dealId = params.dealId;
    if (!/^[0-9a-f-]{36}$/i.test(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as string | undefined;

    if (action === "accept") {
      const { data: result, error: rpcError } = await (supabase as any).rpc("accept_marketplace_deal", {
        p_deal_id: dealId,
        p_actor_user_id: user.id
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
      if (result?.error) {
        return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      }

      return NextResponse.json({ deal: result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "complete") {
      const { data: result, error: rpcError } = await (supabase as any).rpc("complete_marketplace_deal", {
        p_deal_id: dealId,
        p_actor_user_id: user.id
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
      if (result?.error) {
        return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      }

      return NextResponse.json({ deal: result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "deliver") {
      const { data: result, error: rpcError } = await (supabase as any).rpc("deliver_marketplace_deal", {
        p_deal_id: dealId,
        p_actor_user_id: user.id
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (result?.error) return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      return NextResponse.json({ deal: result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "confirm") {
      const { data: result, error: rpcError } = await (supabase as any).rpc("confirm_marketplace_deal", {
        p_deal_id: dealId,
        p_actor_user_id: user.id
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (result?.error) return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      return NextResponse.json({ deal: result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "dispute") {
      const reason = typeof body.reason === "string" ? body.reason : "";
      const { data: result, error: rpcError } = await (supabase as any).rpc("dispute_marketplace_deal", {
        p_deal_id: dealId,
        p_actor_user_id: user.id,
        p_reason: reason
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (result?.error) return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      return NextResponse.json({ deal: result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "review") {
      const rating = Number(body.rating);
      const reviewText = typeof body.reviewText === "string" ? body.reviewText : "";
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      const { data: result, error: rpcError } = await (supabase as any).rpc("create_marketplace_review", {
        p_deal_id: dealId,
        p_buyer_user_id: user.id,
        p_rating: rating,
        p_review_text: reviewText
      });
      if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (result?.error) return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      return NextResponse.json({ review: result }, { headers: NO_STORE_HEADERS });
    }

    if (action === "cancel") {
      const { data: result, error: rpcError } = await (supabase as any).rpc("cancel_marketplace_deal", {
        p_deal_id: dealId,
        p_actor_user_id: user.id
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
      if (result?.error) {
        return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE_HEADERS });
      }

      return NextResponse.json({ deal: result }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ error: "Invalid action. Use 'accept', 'complete', 'deliver', 'confirm', 'dispute', 'review', or 'cancel'." }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to process deal action." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
