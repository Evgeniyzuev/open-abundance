import { NextRequest, NextResponse } from "next/server";
import { ACHIEVEMENT_CATEGORY, achievementStates, parseAchievementLogic } from "@/lib/achievements";
import { loadAchievementCounts } from "@/lib/achievementsServer";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Supabase = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];

async function loadState(supabase: Supabase, userId: string) {
  const [{ data: rows, error: rowsError }, { data: progress, error: progressError }, counts] = await Promise.all([
    supabase.from("challenges").select("id,verification_logic,core_reward_amount,wallet_reward_amount").eq("category", ACHIEVEMENT_CATEGORY).eq("is_active", true),
    supabase.from("user_challenges").select("challenge_id,status,reward_settled_at,updated_at,challenges!inner(category)").eq("user_id", userId).eq("challenges.category", ACHIEVEMENT_CATEGORY),
    loadAchievementCounts(supabase as any, userId)
  ]);
  if (rowsError || progressError) throw new Error(rowsError?.message ?? progressError?.message);
  const claimed = new Map<string, string | null>(
    (progress ?? [])
      .filter((row: any) => String(row.status) === "completed")
      .map((row: any) => [row.challenge_id, row.reward_settled_at ?? row.updated_at ?? null])
  );
  return { counts, achievements: achievementStates((rows ?? []) as any, counts, claimed) };
}

/** The person's achievements: counts, and every milestone as claimed, ready or ahead. */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error: error ?? "Sign in first." }, { status: 401, headers: NO_STORE_HEADERS });
    return NextResponse.json(await loadState(supabase, user.id), { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to load achievements." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

/** Claims one reached milestone: the server recounts, then pays through settle_user_challenge_rewards (once). */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error: error ?? "Sign in first." }, { status: 401, headers: NO_STORE_HEADERS });
    const body = await request.json().catch(() => ({})) as { challengeId?: unknown };
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const { data: row, error: rowError } = await supabase
      .from("challenges")
      .select("id,category,verification_logic,is_active")
      .eq("id", challengeId)
      .maybeSingle();
    if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500, headers: NO_STORE_HEADERS });
    const parsed = parseAchievementLogic(row?.verification_logic);
    if (!row || !row.is_active || row.category !== ACHIEVEMENT_CATEGORY || !parsed) {
      return NextResponse.json({ error: "Achievement not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    const state = await loadState(supabase, user.id);
    const target = state.achievements.find((item) => item.challengeId === row.id);
    if (!target || target.status === "locked") {
      return NextResponse.json({ error: "Not reached yet.", ...state }, { status: 409, headers: NO_STORE_HEADERS });
    }
    if (target.status === "claimed") return NextResponse.json({ claimed: false, ...state }, { headers: NO_STORE_HEADERS });

    const { data: settled, error: settleError } = await (supabase as any).rpc("settle_user_challenge_rewards", { p_user_id: user.id, p_challenge_id: row.id });
    if (settleError) return NextResponse.json({ error: settleError.message }, { status: 500, headers: NO_STORE_HEADERS });
    const result = settled?.[0];
    const [core, wallet, next] = await Promise.all([
      supabase.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle(),
      loadState(supabase, user.id)
    ]);
    return NextResponse.json({
      claimed: Boolean(result?.reward_claimed),
      coreRewardAmount: Number(result?.rewarded_core_amount ?? 0),
      walletRewardAmount: Number(result?.rewarded_wallet_amount ?? 0),
      core: core.data ?? null,
      wallet: wallet.data ?? null,
      ...next
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to claim the achievement." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
