import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const COLUMNS = "id,user_id,status,payout_wallet_amount,total_reserved_amount,error_code,transaction_hash,created_at,broadcast_at,confirmed_at,refunded_at";

/**
 * GET /api/internal/treasury/withdrawals
 *
 * Operator-only list of the latest crypto withdrawals (TON and USDT) with their
 * status, plus withdrawal limit configuration and usage over the last 24 hours.
 * Everyone else receives the same 404 as for a route that does not exist.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user || !isGrowthOperator(auth.user.id)) return json({ error: "Not found." }, 404);

  const db = auth.supabase as any;
  const [ton, usdt, limits] = await Promise.all([
    db.from("ton_withdrawals").select(`${COLUMNS},amount_ton`).order("created_at", { ascending: false }).limit(40),
    db.from("ton_usdt_withdrawals").select(`${COLUMNS},amount_usdt`).order("created_at", { ascending: false }).limit(40),
    db.from("crypto_withdrawal_limits").select("*").eq("id", true).maybeSingle()
  ]);
  for (const result of [ton, usdt, limits]) if (result.error) return json({ error: result.error.message }, 500);

  const rows = [
    ...(ton.data ?? []).map((row: Record<string, unknown>) => ({ ...row, asset: "TON", amount: row.amount_ton })),
    ...(usdt.data ?? []).map((row: Record<string, unknown>) => ({ ...row, asset: "USDT", amount: row.amount_usdt }))
  ]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 50);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const usedLast24h = rows
    .filter((row) => Date.parse(String(row.created_at)) > dayAgo && !["failed", "refunded"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.payout_wallet_amount ?? 0), 0);

  return json({
    withdrawals: rows.map((row) => ({
      id: row.id,
      asset: row.asset,
      amount: row.amount,
      payoutWalletAmount: row.payout_wallet_amount,
      totalReserved: row.total_reserved_amount,
      status: row.status,
      errorCode: row.error_code ?? null,
      transactionHash: row.transaction_hash ?? null,
      userId: row.user_id,
      createdAt: row.created_at,
      broadcastAt: row.broadcast_at ?? null,
      confirmedAt: row.confirmed_at ?? null,
      refundedAt: row.refunded_at ?? null
    })),
    limits: limits.data
      ? { enabled: limits.data.enabled, perUserDaily: Number(limits.data.per_user_daily_amount), globalDaily: Number(limits.data.global_daily_amount), usedLast24h }
      : null
  }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
