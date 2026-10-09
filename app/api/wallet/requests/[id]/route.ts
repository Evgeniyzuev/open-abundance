import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** GET /api/wallet/requests/[id]: what the payer needs to see before confirming. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  if (!isUuid(params.id)) return json({ error: "Payment request was not found." }, 404);

  const db = supabase as any;
  const { data: row, error: readError } = await db
    .from("wallet_payment_requests")
    .select("id,payee_user_id,amount,note,status,expires_at,paid_by_user_id,paid_at,created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (readError) return json({ error: readError.message }, 500);
  if (!row) return json({ error: "Payment request was not found." }, 404);

  const { data: payee } = await db
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,level")
    .eq("user_id", row.payee_user_id)
    .maybeSingle();

  const expired = row.status === "open" && Date.parse(row.expires_at) <= Date.now();
  return json({
    request: {
      id: row.id,
      amount: Number(row.amount),
      note: row.note,
      status: expired ? "expired" : row.status,
      expiresAt: row.expires_at,
      paidAt: row.paid_at,
      isOwn: row.payee_user_id === user.id,
      paidByMe: row.paid_by_user_id === user.id
    },
    payee: payee ?? { user_id: row.payee_user_id, username: null, display_name: null, avatar_url: null, level: 0 }
  }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
