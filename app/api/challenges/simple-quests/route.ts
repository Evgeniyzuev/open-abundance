import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { loadNewcomerProgress } from "@/lib/newcomersServer";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { FOCUS_DAYS_LOGIC, FOCUS_DAYS_TARGET, HELP_NEWCOMER_LIST_LIMIT, HELP_NEWCOMER_LOGIC, questDays } from "@/lib/simpleQuests";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenges/simple-quests?task=focus|help: what the task card shows.
 * focus: the days with a completed task (any 3 count). help: the person's newcomers (came by link or in the team)
 * and whether each completed a task after this one was taken. The reward itself is still given by /api/challenges/check.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as any;
  const task = request.nextUrl.searchParams.get("task");
  const logic = task === "focus" ? FOCUS_DAYS_LOGIC : task === "help" ? HELP_NEWCOMER_LOGIC : null;
  if (!logic) return NextResponse.json({ error: "Unknown task." }, { status: 400, headers: NO_STORE_HEADERS });

  const { data: challenge } = await db.from("challenges").select("id").eq("verification_logic", logic).eq("is_active", true).limit(1).maybeSingle();
  if (!challenge) return NextResponse.json({ error: "Task not found." }, { status: 404, headers: NO_STORE_HEADERS });

  try {
    if (logic === FOCUS_DAYS_LOGIC) {
      const { data: rows, error: rowsError } = await db
        .from("user_challenges")
        .select("challenge_id,status,reward_settled_at,updated_at,challenges(category)")
        .eq("user_id", user.id)
        .eq("status", "completed");
      if (rowsError) throw rowsError;
      const days = questDays((rows ?? []).map((row: any) => ({ ...row, category: row.challenges?.category ?? null })), challenge.id);
      return NextResponse.json({ days: days.slice(-FOCUS_DAYS_TARGET), count: days.length, target: FOCUS_DAYS_TARGET }, { headers: NO_STORE_HEADERS });
    }

    const { data: taken } = await db.from("user_challenges").select("created_at").eq("user_id", user.id).eq("challenge_id", challenge.id).maybeSingle();
    const newcomers = await loadNewcomerProgress(db, user.id, taken?.created_at ?? null);
    return NextResponse.json(
      { takenAt: taken?.created_at ?? null, total: newcomers.length, newcomers: newcomers.slice(0, HELP_NEWCOMER_LIST_LIMIT) },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json({ error: "Could not load the task progress." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
