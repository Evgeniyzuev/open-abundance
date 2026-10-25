import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { activateQuest } from "@/lib/questActivation";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * POST /api/quests/active { challengeId }
 *
 * Makes an accepted quest the active one (docs/QUEST_PATH_PLAN.md). Any accepted quest can be checked at any time;
 * the active one is just the one shown first. Accepting stays with /api/challenges/accept and its eligibility checks.
 */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => null)) as { challengeId?: unknown } | null;
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
  if (!isUuid(challengeId)) return NextResponse.json({ error: "Invalid quest." }, { status: 400, headers: NO_STORE_HEADERS });

  const db = supabase as any;
  const { data: row, error: rowError } = await db.from("user_challenges").select("status").eq("user_id", user.id).eq("challenge_id", challengeId).maybeSingle();
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500, headers: NO_STORE_HEADERS });
  const status = String(row?.status ?? "").trim().toLowerCase();
  if (status !== "accepted" && status !== "failed") {
    return NextResponse.json({ error: "Accept the quest first.", code: "not_accepted" }, { status: 409, headers: NO_STORE_HEADERS });
  }

  const result = await activateQuest(db, user.id, challengeId, { auto: false });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ challengeId, status: result.status, active: true }, { headers: NO_STORE_HEADERS });
}

/**
 * GET /api/quests/active
 *
 * Whether the person has done the first path quest ("First step"). The app opens the quest log on entry until it is
 * done, so the path starts on the first day instead of somewhere in the feed.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as any;
  const { data: first } = await db.from("challenges").select("id").eq("is_active", true).not("path_order", "is", null).order("path_order", { ascending: true }).limit(1).maybeSingle();
  if (!first) return NextResponse.json({ firstStepDone: true }, { headers: NO_STORE_HEADERS });
  const { data: row } = await db.from("user_challenges").select("status").eq("user_id", user.id).eq("challenge_id", first.id).maybeSingle();
  const status = String(row?.status ?? "").toLowerCase();
  return NextResponse.json({ firstStepDone: status === "completed" || status === "declined" }, { headers: NO_STORE_HEADERS });
}
