import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { decryptPaymentDetails } from "@/lib/p2pPaymentDetails";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  if (!isUuid(params.orderId)) return json({ error: "Invalid P2P order ID." }, 400);
  const db = supabase as any;
  const { data: order, error: orderError } = await db.from("p2p_orders")
    .select("buyer_user_id,seller_user_id,status,payment_method_id,payment_due_at")
    .eq("id", params.orderId)
    .maybeSingle();
  if (orderError) return json({ error: orderError.message }, 500);
  if (!order || ![order.buyer_user_id, order.seller_user_id].includes(user.id)) return json({ error: "P2P order not found." }, 404);
  if (!["awaiting_payment", "payment_marked", "review_required", "disputed"].includes(order.status)) return json({ error: "Payment details are no longer available." }, 410);
  const { data: method, error: methodError } = await db.from("p2p_payment_methods")
    .select("method_type,label,encrypted_payload,encryption_iv,encryption_tag,key_version")
    .eq("id", order.payment_method_id)
    .single();
  if (methodError) return json({ error: methodError.message }, 500);
  return json({ methodType: method.method_type, label: method.label, details: decryptPaymentDetails(method), paymentDueAt: order.payment_due_at });
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
