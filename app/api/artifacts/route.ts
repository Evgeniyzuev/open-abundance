import { NextRequest, NextResponse } from "next/server";
import { computeUnlocked } from "@/lib/artifacts";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { hasThreeSteps } from "@/lib/wishSteps";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CompletedRow = {
  reward_settled_at: string | null;
  updated_at: string;
  challenges: { verification_logic: string | null } | Array<{ verification_logic: string | null }> | null;
};

/**
 * The achievement artifacts the person has opened. Everything is derived from facts the server already stores
 * (completed challenges, the Core level, a wish with three steps), so nothing is written and nothing can be
 * claimed from the client.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const [completed, core, wishes] = await Promise.all([
      supabase
        .from("user_challenges")
        .select("reward_settled_at,updated_at,challenges(verification_logic)")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .limit(500),
      supabase.from("core_accounts").select("level").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("wishes")
        .select("description,updated_at")
        .eq("owner_user_id", user.id)
        .is("deleted_at", null)
        .in("status", ["active", "completed"])
        .limit(200)
    ]);
    const failed = [completed, core, wishes].find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500, headers: NO_STORE_HEADERS });

    const completedRows = ((completed.data ?? []) as unknown as CompletedRow[]).map((row) => {
      const challenge = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
      return { logic: challenge?.verification_logic ?? null, at: row.reward_settled_at ?? row.updated_at };
    });
    const wishStepsAt = (wishes.data ?? [])
      .filter((wish) => hasThreeSteps(wish.description))
      .map((wish) => wish.updated_at)
      .sort()[0] ?? null;

    const artifacts = computeUnlocked({ completed: completedRows, level: Number(core.data?.level ?? 0), wishStepsAt });
    return NextResponse.json({ artifacts }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load artifacts." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
