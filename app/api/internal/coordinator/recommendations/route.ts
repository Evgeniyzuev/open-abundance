import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const DECISIONS = ["approved", "rejected", "done", "expired"] as const;
const KINDS = ["match", "challenge", "outreach", "experiment", "support", "other"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Operator-only approval queue for coordinator recommendations.
 *
 *   GET    ?status=proposed   list (target ids shortened; default status proposed)
 *   POST   create an operator or AI authored recommendation
 *   PATCH  { id, status, note?, outcome? } record the decision and, later, the outcome
 *
 * Approving only records the decision. Acting on it (a message, an introduction) stays a human
 * step; the queue is the audit trail that later teaches the coordinator what worked.
 */
async function authorize(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return { response: NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS }) };
  if (!isGrowthOperator(user.id)) return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS }) };
  return { db: supabase as any, userId: user.id };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!("db" in auth)) return auth.response;

  const status = request.nextUrl.searchParams.get("status") ?? "proposed";
  let query = auth.db
    .from("coordinator_recommendations")
    .select("id,kind,title,rationale,expected_effect,risk,target_user_ids,source,status,decision_note,outcome,created_at,decided_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });

  const items = (data ?? []).map((row: any) => ({ ...row, target_user_ids: (row.target_user_ids ?? []).map((id: string) => id.slice(0, 8)) }));
  return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!("db" in auth)) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const kind = KINDS.find((item) => item === body?.kind);
  if (title.length < 3 || !kind) return NextResponse.json({ error: "title and kind are required." }, { status: 400, headers: NO_STORE_HEADERS });

  const targets = Array.isArray(body?.targetUserIds) ? body.targetUserIds.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, 50) : [];
  const source = body?.source === "ai" ? "ai" : "operator";
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

  const { data, error } = await auth.db
    .from("coordinator_recommendations")
    .insert({
      dedupe_key: `${source}:${crypto.randomUUID()}`,
      kind,
      title,
      rationale: text(body?.rationale, 2000),
      expected_effect: text(body?.expectedEffect, 500),
      risk: text(body?.risk, 500),
      target_user_ids: targets,
      source
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ id: data.id }, { status: 201, headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request);
  if (!("db" in auth)) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  const status = DECISIONS.find((item) => item === body?.status);
  if (!id || !status) return NextResponse.json({ error: "id and a valid status are required." }, { status: 400, headers: NO_STORE_HEADERS });

  const update: Record<string, unknown> = { status, decided_by: auth.userId, decided_at: new Date().toISOString() };
  if (typeof body?.note === "string") update.decision_note = body.note.trim().slice(0, 500);
  if (typeof body?.outcome === "string") update.outcome = body.outcome.trim().slice(0, 1000);

  const { error } = await auth.db.from("coordinator_recommendations").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
