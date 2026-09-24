import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user) return json({ error: auth.error }, 401);
  if (!isGrowthOperator(auth.user.id)) return json({ error: "Growth operator access required." }, 403);
  const db = auth.supabase as any;
  const [members, disputes, fund, recoveries] = await Promise.all([
    db.from("p2p_pilot_members").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("p2p_disputes").select("*,order:p2p_orders(*)").in("status", ["open", "under_review", "appealed"]).order("created_at", { ascending: true }).limit(100),
    db.from("p2p_fund_accounts").select("*").eq("id", true).single(),
    db.from("p2p_recovery_claims").select("*").eq("status", "active").order("created_at", { ascending: true }).limit(100)
  ]);
  for (const result of [members, disputes, fund, recoveries]) if (result.error) return json({ error: result.error.message }, 500);
  return json({ members: members.data ?? [], disputes: disputes.data ?? [], fund: fund.data, recoveries: recoveries.data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user) return json({ error: auth.error }, 401);
  if (!isGrowthOperator(auth.user.id)) return json({ error: "Growth operator access required." }, 403);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const idempotencyKey = cleanText(body.idempotencyKey, 160);
  const db = auth.supabase as any;

  if (action === "set_member") {
    const userId = typeof body.userId === "string" && isUuid(body.userId) ? body.userId : null;
    const status = typeof body.status === "string" ? body.status : "";
    const verifiedName = cleanText(body.verifiedName, 160);
    if (!userId || !verifiedName || !["pending", "active", "suspended", "revoked"].includes(status)) return json({ error: "Valid member fields are required." }, 400);
    const { data, error } = await db.rpc("p2p_admin_set_member", { p_user_id: userId, p_status: status, p_verified_name: verifiedName, p_operator_user_id: auth.user.id, p_notes: cleanText(body.notes, 1000) });
    return error ? json({ error: error.message }, 400) : json({ member: data });
  }

  if (action === "fund_adjust") {
    if (!idempotencyKey || typeof body.amount !== "number" || !["funding", "correction"].includes(String(body.operationType))) return json({ error: "Valid fund adjustment is required." }, 400);
    const { data, error } = await db.rpc("p2p_admin_fund_adjust", { p_amount: body.amount, p_operation_type: body.operationType, p_verification_reference: cleanText(body.verificationReference, 500), p_idempotency_key: idempotencyKey });
    return error ? json({ error: error.message }, 400) : json({ entry: data });
  }

  if (action === "resolve_dispute") {
    const orderId = typeof body.orderId === "string" && isUuid(body.orderId) ? body.orderId : null;
    const guiltyUserId = typeof body.guiltyUserId === "string" && isUuid(body.guiltyUserId) ? body.guiltyUserId : null;
    const outcome = typeof body.outcome === "string" ? body.outcome : "";
    const reason = cleanText(body.reason, 4000);
    if (!orderId || !idempotencyKey || !reason || !["release_to_buyer", "refund_seller", "compensate_seller", "dismiss", "record_harm"].includes(outcome)) return json({ error: "Valid dispute resolution is required." }, 400);
    const { data, error } = await db.rpc("p2p_admin_resolve_dispute", { p_order_id: orderId, p_operator_user_id: auth.user.id, p_outcome: outcome, p_reason: reason, p_guilty_user_id: guiltyUserId, p_confirmed_fraud: body.confirmedFraud === true, p_idempotency_key: idempotencyKey });
    return error ? json({ error: error.message }, 400) : json({ order: data });
  }

  if (action === "correct_dispute") {
    const orderId = typeof body.orderId === "string" && isUuid(body.orderId) ? body.orderId : null;
    const reason = cleanText(body.reason, 3000);
    if (!orderId || !idempotencyKey || !reason) return json({ error: "Valid dispute correction is required." }, 400);
    const { data, error } = await db.rpc("p2p_admin_correct_dispute", { p_order_id: orderId, p_operator_user_id: auth.user.id, p_reason: reason, p_idempotency_key: idempotencyKey });
    return error ? json({ error: error.message }, 400) : json({ dispute: data });
  }

  if (action === "process_timers") {
    const { data, error } = await db.rpc("p2p_process_timers", { p_limit: 100 });
    return error ? json({ error: error.message }, 500) : json({ result: data });
  }

  return json({ error: "Unsupported P2P operator action." }, 400);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : null;
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
