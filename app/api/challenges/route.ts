import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { canAcceptChallenge, getChallengeAccessReasons, hasFirstResult, type ChallengeProgressWithCategory } from "@/lib/challengeEligibility";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ChallengeProgress = {
  status: string | null;
  updated_at?: string | null;
  user_id?: string | null;
};

type ChallengeWithProgress = Pick<
  Database["public"]["Tables"]["challenges"]["Row"],
  "id" | "title" | "description" | "instructions" | "requirements" | "core_reward_amount" | "wallet_reward_amount" | "category" | "difficulty_level" | "duration_days" | "image_url" | "verification_type" | "verification_logic" | "sort_order" | "track_key" | "track_step" | "action_view"
> & {
  prerequisite_challenge_id?: string | null;
  acquisition_series?: string | null;
  acquisition_target?: number | null;
  acquisition_metric_key?: string | null;
  is_permanent?: boolean;
  user_challenges?: ChallengeProgress[] | null;
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authRequired = request.nextUrl.searchParams.get("auth") === "required";

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (authRequired && !accessToken) {
    return NextResponse.json({ error: "Missing Supabase access token.", authenticated: false }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  let viewerUserId: string | null = null;

  if (accessToken) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    if (user) {
      viewerUserId = user.id;
    }
  }

  const query = supabase
    .from("challenges")
    .select(
      viewerUserId
        ? "id,title,description,instructions,requirements,core_reward_amount,wallet_reward_amount,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order,track_key,track_step,action_view,prerequisite_challenge_id,acquisition_series,acquisition_target,acquisition_metric_key,is_permanent,user_challenges(status,updated_at,user_id)"
        : "id,title,description,instructions,requirements,core_reward_amount,wallet_reward_amount,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order,track_key,track_step,action_view,prerequisite_challenge_id,acquisition_series,acquisition_target,acquisition_metric_key,is_permanent"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("difficulty_level", { ascending: true });

  if (viewerUserId) {
    query.eq("user_challenges.user_id", viewerUserId);
  }

  const { data: challenges, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  let userChallengeCount = 0;
  let prerequisiteStatuses = new Map<string, string>();
  let viewerHasFirstResult = false;
  let viewerLevel = 1;
  if (viewerUserId) {
    const [{ data: progressRows, error: progressError }, { data: snapshots, error: snapshotError }, { data: coreAccount, error: coreError }] = await Promise.all([
      supabase.from("user_challenges").select("challenge_id,status,challenges(category)").eq("user_id", viewerUserId),
      supabase.from("challenge_completion_snapshots").select("challenge_category").eq("user_id", viewerUserId),
      supabase.from("core_accounts").select("level").eq("user_id", viewerUserId).maybeSingle()
    ]);
    if (progressError || snapshotError || coreError) {
      return NextResponse.json({ error: progressError?.message ?? snapshotError?.message ?? coreError?.message ?? "Failed to load challenge eligibility." }, { status: 500, headers: NO_STORE_HEADERS });
    }
    prerequisiteStatuses = new Map((progressRows ?? []).map((row) => [row.challenge_id, String(row.status).trim().toLowerCase()]));
    viewerHasFirstResult = hasFirstResult(
      snapshots ?? [],
      (progressRows ?? []) as unknown as ChallengeProgressWithCategory[]
    );
    viewerLevel = Number(coreAccount?.level ?? 1);
  }
  const challengeRows = (challenges ?? []) as unknown as ChallengeWithProgress[];
  const data = challengeRows.map((challenge) => {
    const [userChallenge] = challenge.user_challenges ?? [];
    if (userChallenge?.status) userChallengeCount += 1;
    const { user_challenges: _userChallenges, ...publicChallenge } = challenge;

    const prerequisiteCompleted = challenge.verification_logic === "has_referral"
      ? viewerHasFirstResult
      : !challenge.prerequisite_challenge_id || prerequisiteStatuses.get(challenge.prerequisite_challenge_id) === "completed";
    const eligibility = {
      ...challenge,
      prerequisite_completed: prerequisiteCompleted
    };

    return {
      ...publicChallenge,
      user_challenge_status: userChallenge?.status ? String(userChallenge.status).trim().toLowerCase() : null,
      prerequisite_completed: prerequisiteCompleted,
      can_accept: canAcceptChallenge(eligibility, viewerLevel),
      access_reasons: getChallengeAccessReasons(eligibility, viewerLevel)
    };
  });

  return NextResponse.json(
    {
      debug: {
        supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
        serverReadAt: new Date().toISOString()
      },
      authenticated: Boolean(viewerUserId),
      viewerUserId,
      viewerLevel,
      userChallengeCount,
      challenges: data
    },
    {
      headers: NO_STORE_HEADERS
    }
  );
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
