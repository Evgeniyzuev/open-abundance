import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** POST /api/wallet/requests/[id]/pay: pay the request from the signed-in user's Wallet. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  if (!isUuid(params.id)) return json({ error: "Payment request was not found." }, 404);

  const db = supabase as any;
  const { data, error: payError } = await db.rpc("pay_wallet_payment_request", { p_request_id: params.id, p_payer_user_id: user.id });
  if (payError) {
    const message = payError.message || "Could not pay the request.";
    return json({ error: message }, statusFor(message));
  }

  const { data: row } = await db.from("wallet_payment_requests").select("payee_user_id,amount,note").eq("id", params.id).maybeSingle();
  const { data: wallet } = await db.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle();
  const { data: payer } = await db.from("user_profiles").select("display_name,username").eq("user_id", user.id).maybeSingle();

  if (row) {
    const payerName = payer?.display_name || payer?.username || "Участник";
    await db.rpc("create_notification_event", {
      p_event_type: "wallet.payment_request_paid",
      p_category: "wallet",
      p_source_type: "payment_request",
      p_source_id: params.id,
      p_title: "Запрос оплачен",
      p_body: `${payerName} оплатил(а) $${Number(row.amount)}${row.note ? ` · ${row.note}` : ""}`.slice(0, 500),
      p_deep_link: "/?view=wallet.wallet",
      p_recipient_user_ids: [row.payee_user_id],
      p_idempotency_key: `payment-request-paid:${params.id}`,
      p_metadata: { amount: Number(row.amount) }
    });
  }

  return json({ status: data?.[0]?.request_status ?? "paid", wallet }, 200);
}

function statusFor(message: string): number {
  if (message.includes("was not found")) return 404;
  if (message.includes("already paid") || message.includes("not open") || message.includes("expired")) return 409;
  if (message.includes("Insufficient") || message.includes("yourself")) return 400;
  return 500;
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
