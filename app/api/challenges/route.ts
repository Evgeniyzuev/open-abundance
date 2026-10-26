import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { canAcceptChallenge, getChallengeAccessReasons, hasFirstResult, isChallengeAlmostAvailable, type ChallengeProgressWithCategory } from "@/lib/challengeEligibility";
import { activateQuest } from "@/lib/questActivation";
import { AUTO_TAKEN_LOGICS, buildQuestPath, parseMotives, type QuestMotive } from "@/lib/questPath";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { walletChallengeProgress, walletChallengeRule, walletStats, type StayLedgerRow, type WalletChallengeProgress } from "@/lib/stayStreak";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ChallengeProgress = {
  status: string | null;
  is_active?: boolean | null;
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
  path_order?: number | null;
  unlock_at_completed?: number | null;
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
        ? "id,title,description,instructions,requirements,core_reward_amount,wallet_reward_amount,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order,track_key,track_step,action_view,prerequisite_challenge_id,acquisition_series,acquisition_target,acquisition_metric_key,is_permanent,path_order,unlock_at_completed,user_challenges(status,updated_at,user_id,is_active)"
        : "id,title,description,instructions,requirements,core_reward_amount,wallet_reward_amount,category,difficulty_level,duration_days,image_url,verification_type,verification_logic,sort_order,track_key,track_step,action_view,prerequisite_challenge_id,acquisition_series,acquisition_target,acquisition_metric_key,is_permanent,path_order,unlock_at_completed"
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
  let viewerHumanConfirmed: boolean | undefined;
  let viewerLedger: StayLedgerRow[] = [];
  let viewerMotives: QuestMotive[] = [];
  const completedAt = new Map<string, Date>();
  if (viewerUserId) {
    const [{ data: progressRows, error: progressError }, { data: snapshots, error: snapshotError }, { data: coreAccount, error: coreError }, humanity, ledger, motiveRow] = await Promise.all([
      supabase.from("user_challenges").select("challenge_id,status,updated_at,reward_settled_at,challenges(category)").eq("user_id", viewerUserId),
      supabase.from("challenge_completion_snapshots").select("challenge_category").eq("user_id", viewerUserId),
      supabase.from("core_accounts").select("level").eq("user_id", viewerUserId).maybeSingle(),
      (supabase as any).from("humanity_verifications").select("humanity_level").eq("user_id", viewerUserId).maybeSingle(),
      supabase.from("wallet_ledger").select("operation_type,direction,amount,created_at").eq("user_id", viewerUserId).in("operation_type", ["crypto_deposit", "crypto_withdrawal"]),
      (supabase as any).from("user_profiles").select("quest_motive,quest_motives").eq("user_id", viewerUserId).maybeSingle()
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
    // A failed humanity lookup leaves the gate open rather than locking everyone out.
    if (!humanity.error) viewerHumanConfirmed = Number(humanity.data?.humanity_level ?? 0) >= 2;
    viewerLedger = (ledger.data ?? []) as StayLedgerRow[];
    viewerMotives = parseMotives(motiveRow.data?.quest_motives?.length ? motiveRow.data.quest_motives : motiveRow.data?.quest_motive);
    for (const row of progressRows ?? []) {
      if (String(row.status).trim().toLowerCase() !== "completed") continue;
      const time = Date.parse(String(row.reward_settled_at ?? row.updated_at ?? ""));
      if (Number.isFinite(time)) completedAt.set(row.challenge_id, new Date(time));
    }
  }
  const viewerNow = new Date();
  const challengeRows = (challenges ?? []) as unknown as ChallengeWithProgress[];
  const data = challengeRows.map((challenge) => {
    const [userChallenge] = challenge.user_challenges ?? [];
    if (userChallenge?.status) userChallengeCount += 1;
    const { user_challenges: _userChallenges, ...publicChallenge } = challenge;

    const prerequisiteCompleted = !challenge.prerequisite_challenge_id || prerequisiteStatuses.get(challenge.prerequisite_challenge_id) === "completed";
    const eligibility = {
      ...challenge,
      prerequisite_completed: prerequisiteCompleted,
      humanity_confirmed: viewerHumanConfirmed
    };
    let progress: WalletChallengeProgress | null = null;
    const walletRule = viewerUserId ? walletChallengeRule(challenge.verification_logic) : null;
    if (walletRule && userChallenge?.status !== "completed") {
      const since = walletRule.kind === "stay" && challenge.prerequisite_challenge_id ? completedAt.get(challenge.prerequisite_challenge_id) : undefined;
      progress = walletChallengeProgress(walletRule, walletStats(viewerLedger, viewerNow, since));
    }

    return {
      ...publicChallenge,
      user_challenge_status: userChallenge?.status ? String(userChallenge.status).trim().toLowerCase() : null,
      user_challenge_active: Boolean(userChallenge?.is_active),
      prerequisite_completed: prerequisiteCompleted,
      progress,
      can_accept: canAcceptChallenge(eligibility, viewerLevel),
      access_reasons: getChallengeAccessReasons(eligibility, viewerLevel),
      almost_eligible: false
    };
  });

  for (const challenge of data) {
    challenge.almost_eligible = !challenge.can_accept && isChallengeAlmostAvailable(challenge, viewerLevel, data);
  }
  // "Come back tomorrow" and "Invite a friend" are taken on the first visit (never over a skip); they are off the path.
  if (viewerUserId) {
    const toTake = data.filter((challenge) => (AUTO_TAKEN_LOGICS as readonly string[]).includes(String(challenge.verification_logic)) && !challenge.user_challenge_status && challenge.can_accept !== false);
    if (toTake.length) {
      const now = new Date().toISOString();
      const { error: takeError } = await (supabase as any).from("user_challenges").upsert(
        toTake.map((challenge) => ({ user_id: viewerUserId, challenge_id: challenge.id, status: "accepted", updated_at: now })),
        { onConflict: "user_id,challenge_id", ignoreDuplicates: true }
      );
      if (!takeError) {
        for (const challenge of toTake) challenge.user_challenge_status = "accepted";
        await Promise.all(toTake.map((challenge) => recordProductEvent({ entityId: challenge.id, entityType: "challenge", eventName: "challenge_accepted", properties: { auto: true, via: "auto_taken" }, source: "server", userId: viewerUserId })));
      }
    }
  }
  let questPath = buildQuestPath(data, viewerMotives, { signedIn: Boolean(viewerUserId) });

  // Nothing is active yet: the path's next quest is accepted and becomes active by itself.
  if (viewerUserId && questPath.autoActivateId) {
    const activated = await activateQuest(supabase, viewerUserId, questPath.autoActivateId, { auto: true });
    if (!("error" in activated)) {
      for (const challenge of data) {
        const isTarget = challenge.id === questPath.autoActivateId;
        if (isTarget) challenge.user_challenge_status = activated.status;
        challenge.user_challenge_active = isTarget;
      }
      questPath = buildQuestPath(data, viewerMotives, { signedIn: true });
    }
  }

  const quests = data.map((challenge) => ({
    ...challenge,
    quest_placement: questPath.placements[challenge.id] ?? "hidden",
    quests_missing: questPath.questsMissing[challenge.id] ?? null
  }));

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
      quest: {
        activeId: questPath.activeId,
        pathTotal: questPath.pathTotal,
        pathDone: questPath.pathDone,
        activePathStep: questPath.activePathStep,
        motive: viewerMotives[0] ?? null,
        motives: viewerMotives
      },
      challenges: quests
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
