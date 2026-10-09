import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** POST /api/wallet/requests/[id]/cancel: the requester withdraws an open request. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  if (!isUuid(params.id)) return json({ error: "Payment request was not found." }, 404);

  const db = supabase as any;
  const { data, error: updateError } = await db
    .from("wallet_payment_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("payee_user_id", user.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (updateError) return json({ error: updateError.message }, 500);
  if (!data) return json({ error: "Only an open request can be cancelled." }, 409);
  return json({ status: "cancelled" }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
