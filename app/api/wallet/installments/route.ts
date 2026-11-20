import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { dailyRepayment } from "@/lib/coreInstallments";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

/** GET /api/wallet/installments: the «Взять и купить» limit and the person's open installments as buyer and seller. */
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const db = createServiceSupabaseClient() as any;
  const { data: limit, error: limitError } = await db.rpc("core_installment_limit", { p_user_id: user.id });
  // Before the migration is applied the feature is simply absent.
  if (limitError) return json({ available: false });
  const { data: rows } = await db.from("core_installments").select("id,buyer_user_id,seller_user_id,amount,remaining,status,created_at")
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`).in("status", ["pending", "open"]).order("created_at", { ascending: true }).limit(50);
  const perDay = dailyRepayment(Number(limit?.core ?? 0));
  const owe = (rows ?? []).filter((row: any) => row.buyer_user_id === user.id);
  const owed = (rows ?? []).filter((row: any) => row.seller_user_id === user.id);
  const sum = (list: any[]) => Math.round(list.reduce((total, row) => total + Number(row.remaining), 0) * 100) / 100;
  return json({
    available: true,
    eligible: Boolean(limit?.eligible),
    limit: Number(limit?.limit ?? 0),
    dailyRepayment: perDay,
    repaying: sum(owe),
    repayingDays: perDay > 0 ? Math.ceil(sum(owe) / perDay) : null,
    incoming: sum(owed)
  });
}

/** POST /api/wallet/installments { amount, idempotencyKey }: repay early from the Wallet, no fee. */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const body = (await request.json().catch(() => ({}))) as { amount?: unknown; idempotencyKey?: unknown };
  const amount = Number(body.amount);
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";
  if (!Number.isFinite(amount) || amount <= 0 || !key) return json({ error: "amount and idempotencyKey are required." }, 400);
  const { data, error: rpcError } = await (createServiceSupabaseClient() as any).rpc("repay_core_installments_early", { p_user_id: user.id, p_amount: amount, p_idempotency_key: key });
  if (rpcError) return json({ error: rpcError.message }, 500);
  if (data?.error) return json({ error: data.error }, 400);
  return json(data);
}
