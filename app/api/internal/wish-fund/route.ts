import { NextRequest, NextResponse } from "next/server";
import { authorizeClaudeOrOperator } from "@/lib/claudeActionsAuth";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { weekStartMs } from "@/lib/weeklyWishes";
import { parseFundEntry, summarizeFund, type FundRow } from "@/lib/wishFund";

export const dynamic = "force-dynamic";

// The table comes from migration 20261111130000 and is not in the generated types yet.
type LooseDb = { from: (table: string) => any };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

/** GET /api/internal/wish-fund: the whole ledger with totals, for the operator and the daily procedure. */
export async function GET(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const db = createServiceSupabaseClient() as unknown as LooseDb;
  const { data, error } = await db.from("wish_fund_entries").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) return json({ error: error.message }, 500);
  return json({ summary: summarizeFund((data ?? []) as FundRow[]), entries: data ?? [] });
}

/**
 * POST /api/internal/wish-fund { kind, amount?, title?, personDid?, result?, isPublic?, userId?, wishId? }
 *
 * Adds one ledger row: a contribution (kind founder | patron) or a fulfilled wish (help | habit | money).
 * `isPublic` may be true only after the person agreed that the title, their steps and the result are shown on /fund.
 * The row only records what happened; paying a money wish is a separate, approved action.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const entry = parseFundEntry(await request.json().catch(() => null));
  if (typeof entry === "string") return json({ error: entry }, 400);

  const db = createServiceSupabaseClient() as unknown as LooseDb;
  const { data, error } = await db.from("wish_fund_entries").insert({
    direction: entry.direction,
    kind: entry.kind,
    amount: entry.amount,
    week_start: new Date(weekStartMs(Date.now())).toISOString().slice(0, 10),
    user_id: entry.userId,
    wish_id: entry.wishId,
    title: entry.title,
    person_did: entry.personDid,
    result: entry.result,
    is_public: entry.isPublic
  }).select("id,week_start").single();
  if (error) return json({ error: error.message }, 500);
  return json({ id: data.id, weekStart: data.week_start }, 201);
}
