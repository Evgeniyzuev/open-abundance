import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { reconcileWithdrawals } from "@/lib/withdrawalReconciler";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

/**
 * POST /api/internal/ton/withdrawals/reconcile
 *
 * Called by pg_cron every minute with the shared scanner secret. Settles
 * withdrawals that were broadcast (or whose broadcast is unclear) against the
 * operating wallet history: confirmed when found, refunded once when the signed
 * message has expired, manual review plus an operator notification otherwise.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TON_SCANNER_SECRET?.trim();
  const provided = request.headers.get("x-ton-scanner-secret")?.trim() ?? "";
  if (!expected || !safeEqual(provided, expected)) return json({ error: "Unauthorized." }, 401);

  const supabase = createServiceSupabaseClient() as any;
  try {
    const summary = await reconcileWithdrawals(supabase, async (id, asset, reason) => {
      const operatorIds = (process.env.GROWTH_OPERATOR_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(isUuid);
      if (operatorIds.length === 0) return;
      await supabase.rpc("create_notification_event", {
        p_event_type: "treasury.withdrawal_review",
        p_category: "system",
        p_source_type: "withdrawal",
        p_source_id: id,
        p_title: `Вывод ${asset} требует проверки`,
        p_body: reason.slice(0, 300) || "Не удалось автоматически сверить вывод с блокчейном.",
        p_deep_link: "/?operator=1",
        p_recipient_user_ids: operatorIds,
        p_idempotency_key: `withdrawal-review:${asset}:${id}`,
        p_metadata: { withdrawalId: id, asset }
      });
    });
    return json(summary, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Reconciliation failed." }, 500);
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
