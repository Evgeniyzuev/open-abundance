import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { cleanPaymentNote, PAYMENT_REQUEST_MAX_OPEN, parsePaymentAmount, paymentRequestLink } from "@/lib/paymentRequests";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const COLUMNS = "id,amount,note,status,expires_at,paid_by_user_id,paid_at,created_at";

/** GET /api/wallet/requests: the signed-in user's own payment requests (newest first). */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  const db = supabase as any;
  const { data, error: listError } = await db
    .from("wallet_payment_requests")
    .select(COLUMNS)
    .eq("payee_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (listError) return json({ error: listError.message }, 500);
  const origin = request.nextUrl.origin;
  return json({ requests: (data ?? []).map((row: any) => ({ ...row, link: paymentRequestLink(origin, row.id) })) }, 200);
}

/** POST /api/wallet/requests: create a request for a fixed amount. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);

  const body = (await request.json().catch(() => ({}))) as { amount?: unknown; note?: unknown };
  const amount = parsePaymentAmount(body.amount);
  if (amount === null) return json({ error: "Enter an amount greater than 0 with up to 6 decimals." }, 400);

  const db = supabase as any;
  const now = new Date().toISOString();
  const { count, error: countError } = await db
    .from("wallet_payment_requests")
    .select("id", { count: "exact", head: true })
    .eq("payee_user_id", user.id)
    .eq("status", "open")
    .gt("expires_at", now);
  if (countError) return json({ error: countError.message }, 500);
  if ((count ?? 0) >= PAYMENT_REQUEST_MAX_OPEN) return json({ error: "Too many open payment requests. Cancel some first." }, 429);

  const { data: wallet } = await db.from("wallet_accounts").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!wallet) return json({ error: "Wallet is not created yet." }, 404);

  const { data, error: insertError } = await db
    .from("wallet_payment_requests")
    .insert({ payee_user_id: user.id, amount, note: cleanPaymentNote(body.note) })
    .select(COLUMNS)
    .single();
  if (insertError) return json({ error: insertError.message }, 500);
  return json({ request: { ...data, link: paymentRequestLink(request.nextUrl.origin, data.id) } }, 201);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
