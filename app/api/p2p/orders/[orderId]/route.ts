import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user) return json({ error: auth.error }, 401);
  if (!isUuid(params.orderId)) return json({ error: "Invalid P2P order ID." }, 400);
  const db = auth.supabase as any;
  const { data: order, error } = await db.from("p2p_orders")
    .select("*,ad:p2p_ads(id,direction,seller_user_id,rub_per_wallet,min_wallet_amount,max_wallet_amount),dispute:p2p_disputes(*),events:p2p_order_events(*)")
    .eq("id", params.orderId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ error: "P2P order not found." }, 404);
  const operator = isGrowthOperator(auth.user.id);
  if (!operator && ![order.buyer_user_id, order.seller_user_id].includes(auth.user.id)) return json({ error: "P2P order not found." }, 404);
  return json({ order, allowedActions: allowedActions(order, auth.user.id, operator) });
}

function allowedActions(order: any, userId: string, operator: boolean): string[] {
  if (operator) return ["view_messages", "view_evidence"];
  const actions: string[] = ["view_messages"];
  const isBuyer = order.buyer_user_id === userId;
  const isOwner = order.ad_owner_user_id === userId;
  const isRequester = order.requester_user_id === userId;
  if (order.status === "pending_acceptance" && isOwner) actions.push("accept_order", "reject_order");
  if (order.status === "pending_acceptance" && isRequester) actions.push("cancel");
  if (order.status === "awaiting_payment" && isBuyer) actions.push("mark_paid", "cancel");
  if (["payment_marked", "review_required"].includes(order.status) && !isBuyer) actions.push("confirm_received");
  if (["payment_marked", "review_required", "released", "settled"].includes(order.status)) actions.push("open_dispute");
  return actions;
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
