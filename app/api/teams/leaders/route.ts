import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

type LeaderOption = { leader_user_id: string; level: number; free_points: number; is_current: boolean; is_referrer: boolean };

// The RPCs come from migration 20261027180000 and are not in the generated types yet.
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Leads the follower can choose now (always higher in level) and when the next choice is allowed. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const rpc = supabase as unknown as RpcClient;

  const [optionsResult, nextResult] = await Promise.all([
    rpc.rpc("list_my_team_leader_options", { p_limit: 20 }),
    rpc.rpc("my_team_leader_next_choice_at")
  ]);
  if (optionsResult.error) return NextResponse.json({ error: optionsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (nextResult.error) return NextResponse.json({ error: nextResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });

  const options = (optionsResult.data ?? []) as LeaderOption[];
  const ids = options.map((option) => option.leader_user_id);
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("user_profiles").select("user_id,username,display_name,avatar_url,avatar_position,level").in("user_id", ids)
    : { data: [], error: null };
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500, headers: NO_STORE_HEADERS });

  return NextResponse.json({
    options: options.map((option) => ({
      userId: option.leader_user_id,
      level: option.level,
      freePoints: option.free_points,
      isCurrent: option.is_current,
      isReferrer: option.is_referrer,
      profile: (profiles ?? []).find((profile) => profile.user_id === option.leader_user_id) ?? null
    })),
    nextChoiceAt: (nextResult.data as string | null) ?? null
  }, { headers: NO_STORE_HEADERS });
}

/** The follower picks a lead from the available ones, at most once a day. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  let body: { leaderUserId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is answered below.
  }
  const leaderUserId = normalizeUuid(body.leaderUserId);
  if (!leaderUserId) return NextResponse.json({ error: "leaderUserId is required." }, { status: 400, headers: NO_STORE_HEADERS });

  const { data, error: rpcError } = await (supabase as unknown as RpcClient).rpc("choose_my_team_leader", { p_leader_user_id: leaderUserId });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500, headers: NO_STORE_HEADERS });
  const [result] = (data ?? []) as Array<{ status: string; next_choice_at: string | null }>;
  const status = result?.status ?? "not_available";
  return NextResponse.json({ status, nextChoiceAt: result?.next_choice_at ?? null }, { status: status === "changed" ? 200 : 409, headers: NO_STORE_HEADERS });
}
