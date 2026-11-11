import { NextRequest, NextResponse } from "next/server";
import { authorizeClaudeOrOperator } from "@/lib/claudeActionsAuth";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
const FIELDS = "withdrawals_paused,paused_reason,paused_at,last_unexplained_at,last_ton_balance,last_usdt_balance,last_checked_at";

/** GET /api/internal/treasury/guard: the reserve guard state (paused or not, why, last seen balances). */
export async function GET(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db.from("treasury_coverage_state").select(FIELDS).eq("id", true).maybeSingle();
  if (error) return json({ error: error.message, hint: "Migration 20261111150000 may not be applied yet." }, 500);
  return json({ guard: data });
}

/**
 * POST /api/internal/treasury/guard { paused: boolean, reason? }
 *
 * Resumes withdrawals after the operator checked the reserve wallet, or pauses them by hand. Resuming also takes
 * the current balances as the new baseline at the next check, so the same drop does not pause again.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const payload = await request.json().catch(() => null) as { paused?: unknown; reason?: unknown } | null;
  if (typeof payload?.paused !== "boolean") return json({ error: "paused: true or false." }, 400);
  const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 200) : null;
  const db = createServiceSupabaseClient() as any;
  const now = new Date().toISOString();
  const { data, error } = await db.from("treasury_coverage_state").update(
    payload.paused
      ? { withdrawals_paused: true, paused_reason: reason ?? "paused by operator", paused_at: now, updated_at: now }
      : { withdrawals_paused: false, paused_reason: null, paused_at: null, last_ton_balance: null, last_usdt_balance: null, updated_at: now }
  ).eq("id", true).select(FIELDS).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  return json({ guard: data });
}
