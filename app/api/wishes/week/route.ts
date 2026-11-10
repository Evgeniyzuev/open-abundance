import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { buildWeeklyWishState, weekStartMs } from "@/lib/weeklyWishes";

export const dynamic = "force-dynamic";

/** Whether the person's wish takes part in "Wishes of the week" and what is left to do for it. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const now = Date.now();
  const since = new Date(weekStartMs(now)).toISOString();

  const [wishes, steps, fulfilled] = await Promise.all([
    supabase.from("wishes").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id).eq("status", "active").is("deleted_at", null),
    supabase.from("user_challenges").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed").gte("updated_at", since),
    supabase.from("wishes").select("id", { count: "exact", head: true }).eq("status", "completed").is("deleted_at", null)
  ]);
  if (wishes.error || steps.error) return NextResponse.json({ available: false }, { headers: NO_STORE_HEADERS });

  return NextResponse.json(
    { available: true, ...buildWeeklyWishState({ now, activeWishes: wishes.count ?? 0, stepsThisWeek: steps.count ?? 0, fulfilledTotal: fulfilled.count ?? 0 }) },
    { headers: NO_STORE_HEADERS }
  );
}
