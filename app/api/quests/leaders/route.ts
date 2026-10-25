import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { LEADERS_WINDOW_MS, weeklyLeaders, type LeaderRow } from "@/lib/questLeaders";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/quests/leaders
 *
 * Leaders of the week on the growth path (lib/questLeaders.ts): public name, avatar and number of quests, nothing
 * else. Signed-in people also get their own count. Open to guests, so the pace of others is visible before sign-up.
 */
export async function GET(request: NextRequest) {
  const db = createServiceSupabaseClient() as any;
  const now = Date.now();
  const since = new Date(now - LEADERS_WINDOW_MS).toISOString();
  const [rows, onboarding] = await Promise.all([
    db.from("user_challenges").select("user_id,challenge_id,status,updated_at").eq("status", "completed").gte("updated_at", since).limit(5000),
    db.from("challenges").select("id").eq("category", "onboarding")
  ]);
  if (rows.error) return json({ error: "Could not load leaders." }, 500);
  const onboardingIds = new Set<string>((onboarding.data ?? []).map((row: { id: string }) => row.id));
  const all = weeklyLeaders((rows.data ?? []) as LeaderRow[], onboardingIds, now, 1000);
  const top = all.slice(0, 5);

  const ids = top.map((leader) => leader.userId);
  const { data: profiles } = ids.length
    ? await db.from("user_profiles").select("user_id,username,display_name,first_name,avatar_url,deleted_at").in("user_id", ids)
    : { data: [] };
  const profileById = new Map<string, any>((profiles ?? []).map((row: any) => [row.user_id, row]));

  // The viewer is optional: a guest simply gets no "you" line.
  const viewer = request.headers.get("authorization") ? await getAuthenticatedUser(request).catch(() => null) : null;
  const viewerId = viewer?.user?.id ?? null;
  const viewerIndex = viewerId ? all.findIndex((leader) => leader.userId === viewerId) : -1;

  return json({
    windowDays: 7,
    leaders: top
      .filter((leader) => !profileById.get(leader.userId)?.deleted_at)
      .map((leader, index) => {
        const profile = profileById.get(leader.userId);
        return {
          rank: index + 1,
          name: String(profile?.display_name || profile?.first_name || (profile?.username ? `@${profile.username}` : "") || "").slice(0, 40) || null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatar_url ?? null,
          quests: leader.quests,
          isViewer: leader.userId === viewerId
        };
      }),
    viewer: viewerId ? { rank: viewerIndex >= 0 ? viewerIndex + 1 : null, quests: viewerIndex >= 0 ? all[viewerIndex].quests : null } : null
  }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
