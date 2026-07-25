import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { syncTodayForUser } from "@/lib/serverToday";

type CheckRequest = {
  challengeId?: string;
};

type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"];

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to check the challenge." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CheckRequest;
  if (!body.challengeId || !isUuid(body.challengeId)) {
    return NextResponse.json({ error: "Invalid challenge." }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", body.challengeId)
    .eq("is_active", true)
    .maybeSingle();

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 });
  }

  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  const verification = await verifyChallenge(supabase, user.id, challenge);
  if (!verification.ok) {
    await supabase.from("user_challenges").upsert(
      {
        user_id: user.id,
        challenge_id: challenge.id,
        status: "accepted",
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,challenge_id" }
    );

    return NextResponse.json({
      debug: {
        supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
        serverReadAt: new Date().toISOString()
      },
      userId: user.id,
      challengeId: challenge.id,
      status: "accepted",
      completed: false,
      message: verification.reason
    });
  }

  const rewardAmount = getRewardAmount(challenge.reward_label);
  const { data: completion, error: completionError } = await supabase.rpc("complete_user_challenge", {
    p_user_id: user.id,
    p_challenge_id: challenge.id,
    p_reward_account: "core",
    p_reward_amount: rewardAmount
  });

  if (completionError) {
    return NextResponse.json({ error: completionError.message }, { status: 500 });
  }

  const result = completion?.[0];
  let feedPostId: string | null = null;
  if (result?.reward_claimed) {
    await recordProductEvent({
      entityId: challenge.id,
      entityType: "challenge",
      eventName: "challenge_completed",
      properties: { reward_account: result.rewarded_account ?? "core", reward_amount: Number(result.rewarded_amount ?? rewardAmount) },
      source: "server",
      userId: user.id
    });

    // Create verified Challenge Done post in feed
    try {
      const { error: verifiedPostError } = await (supabase as any).rpc("create_verified_challenge_post", {
        p_user_id: user.id,
        p_challenge_id: challenge.id,
        p_challenge_title: challenge.title,
        p_challenge_category: challenge.category,
        p_verification_type: challenge.verification_type
      });
      if (verifiedPostError) {
        console.error("Failed to create verified challenge post:", verifiedPostError.message);
      }
      const { data: snapshot } = await (supabase as any)
        .from("challenge_completion_snapshots")
        .select("feed_post_id")
        .eq("user_id", user.id)
        .eq("challenge_id", challenge.id)
        .maybeSingle();
      feedPostId = snapshot?.feed_post_id ?? null;
      if (feedPostId) {
        await supabase.from("feed_posts").update({ status: "draft", published_at: null }).eq("id", feedPostId).eq("author_user_id", user.id);
        const { count } = await supabase.from("feed_post_media").select("id", { count: "exact", head: true }).eq("post_id", feedPostId);
        if (!count) {
          await supabase.from("feed_post_media").insert({
            post_id: feedPostId,
            media_type: "image",
            media_url: "/feed/system-events/challenge-completed.png",
            alt_text: {},
            sort_order: 0,
            metadata: { origin: "system_template", templateKey: "challenge_completed" }
          });
        }
      }
    } catch (postError) {
      console.error("Failed to create verified challenge post:", postError instanceof Error ? postError.message : "Unknown error");
    }
  }
  const [coreResult, walletResult] = await Promise.all([
    supabase.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle()
  ]);

  if (coreResult.error) {
    return NextResponse.json({ error: coreResult.error.message }, { status: 500 });
  }

  if (walletResult.error) {
    return NextResponse.json({ error: walletResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    debug: {
      supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
      serverReadAt: new Date().toISOString()
    },
    userId: user.id,
    challengeId: challenge.id,
    status: result?.challenge_status ?? "completed",
    completed: true,
    core: coreResult.data,
    wallet: walletResult.data,
    rewardClaimed: Boolean(result?.reward_claimed),
    feedPostId,
    rewardAccount: result?.rewarded_account ?? "core",
    rewardAmount: Number(result?.rewarded_amount ?? rewardAmount)
  });
}

async function verifyChallenge(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  challenge: ChallengeRow
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (challenge.verification_logic === "signup") {
    const [profile, core, wallet] = await Promise.all([
      supabase.from("user_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.from("core_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.from("wallet_accounts").select("user_id").eq("user_id", userId).maybeSingle()
    ]);

    if (profile.error || core.error || wallet.error) {
      return { ok: false, reason: "Could not check the account. Try again." };
    }

    if (!profile.data) return { ok: false, reason: "Profile is not created yet. Refresh the page or sign in again." };
    if (!core.data) return { ok: false, reason: "Core is not created yet. Refresh the page or sign in again." };
    if (!wallet.data) return { ok: false, reason: "Wallet is not created yet. Refresh the page or sign in again." };

    return { ok: true };
  }

  if (challenge.verification_logic === "calculate_time_to_goal") {
    const [calculatorProgress, quizProgress] = await Promise.all([
      getChallengeProgressProof(supabase, userId, challenge, "calculated"),
      getChallengeProgressProof(supabase, userId, challenge, "compound_quiz_passed")
    ]);
    if (calculatorProgress.error || quizProgress.error) {
      return { ok: false, reason: "Could not check calculator progress. Try again." };
    }

    if (!calculatorProgress.proved) {
      return { ok: false, reason: "Use the Core calculator first, then check this challenge." };
    }

    if (!quizProgress.proved) {
      return { ok: false, reason: "Pass the compound interest test first, then check this challenge." };
    }

    if (calculatorProgress.proved && quizProgress.proved) {
      return { ok: true };
    }
  }

  if (challenge.verification_logic === "ai_message_sent") {
    const progress = await getChallengeProgressProof(supabase, userId, challenge, "ai_message_sent");
    if (progress.error) {
      return { ok: false, reason: "Could not check AI progress. Try again." };
    }

    if (progress.proved) {
      return { ok: true };
    }

    return { ok: false, reason: "Send one message to AI first, then check this challenge." };
  }

  if (challenge.verification_logic === "has_wish") {
    const { data, error } = await supabase
      .from("wishes")
      .select("id")
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check wishes. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Create a wish first, then check this challenge." };
  }

  if (challenge.verification_logic === "profile_strengths_filled") {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("bio")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "Could not check your profile. Try again." };
    }

    if (wordCount(data?.bio) >= 20) {
      return { ok: true };
    }

    return { ok: false, reason: "Add a short profile bio with your skills, interests, and experience first." };
  }

  if (challenge.verification_logic === "skill_profile_completed") {
    const [profileResult, linksResult] = await Promise.all([
      supabase.from("user_profiles").select("bio").eq("user_id", userId).maybeSingle(),
      supabase.from("user_profile_links").select("id").eq("user_id", userId).limit(1)
    ]);

    if (profileResult.error || linksResult.error) {
      return { ok: false, reason: "Could not check your skill profile. Try again." };
    }

    if (wordCount(profileResult.data?.bio) >= 20 && (linksResult.data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Add a profile bio and at least one public or private proof link first." };
  }

  if (challenge.verification_logic === "wish_steps_created") {
    const { data, error } = await supabase
      .from("wishes")
      .select("description")
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .in("status", ["active", "completed"]);

    if (error) {
      return { ok: false, reason: "Could not check wish steps. Try again." };
    }

    if ((data ?? []).some((wish) => hasThreeSteps(wish.description))) {
      return { ok: true };
    }

    return { ok: false, reason: "Add at least three clear steps to one wish description first." };
  }

  if (challenge.verification_logic === "first_growth_post_published") {
    const { data, error } = await supabase
      .from("feed_posts")
      .select("id")
      .eq("author_user_id", userId)
      .eq("status", "published")
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check published posts. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Publish one progress, wish, or manual post first." };
  }

  if (challenge.verification_logic === "reinvest_enabled") {
    const { data, error } = await supabase
      .from("core_accounts")
      .select("reinvest_percent")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "Could not check reinvest settings. Try again." };
    }

    if (Number(data?.reinvest_percent ?? 0) > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Set reinvest above 0% first." };
  }

  if (challenge.verification_logic === "today_core_target_reached") {
    try {
      const payload = await syncTodayForUser(supabase, userId, { complete: true });
      if (payload.today.status === "completed") {
        return { ok: true };
      }

      return { ok: false, reason: "Reach today's Core target in Today first." };
    } catch {
      return { ok: false, reason: "Could not check Today progress. Try again." };
    }
  }

  if (challenge.verification_logic === "today_completion_streak_7") {
    try {
      const payload = await syncTodayForUser(supabase, userId);
      if (payload.completionStreak >= 7) return { ok: true };
      return { ok: false, reason: `Complete Today for 7 consecutive days. Current streak: ${payload.completionStreak}.` };
    } catch {
      return { ok: false, reason: "Could not check the Today streak. Try again." };
    }
  }

  if (challenge.verification_logic === "today_completion_total_30") {
    try {
      const payload = await syncTodayForUser(supabase, userId);
      if (payload.totalCompletions >= 30) return { ok: true };
      return { ok: false, reason: `Complete Today 30 times. Current total: ${payload.totalCompletions}.` };
    } catch {
      return { ok: false, reason: "Could not check completed Today days. Try again." };
    }
  }

  if (challenge.verification_logic === "first_wallet_to_core") {
    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("operation_type", "wallet_core_topup")
      .eq("source_type", "core_topup")
      .eq("direction", "debit")
      .gt("amount", 0)
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check Wallet to Core transfer. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Move any amount from Wallet to Core first." };
  }

  if (challenge.verification_logic === "first_wallet_transfer") {
    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("operation_type", "wallet_transfer")
      .eq("source_type", "wallet_transfer")
      .eq("direction", "debit")
      .not("counterparty_user_id", "is", null)
      .neq("counterparty_user_id", userId)
      .gt("amount", 0)
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check Wallet transfer. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Send any Wallet amount to another participant first." };
  }

  if (challenge.verification_logic === "has_referral") {
    const { data, error } = await supabase
      .from("referral_edges")
      .select("referral_user_id")
      .eq("referrer_user_id", userId)
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check referrals. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Invite one person who completes registration first." };
  }

  if (challenge.verification_logic === "team_contact_active") {
    const { data, error } = await supabase
      .from("user_contacts")
      .select("contact_user_id")
      .eq("owner_user_id", userId)
      .eq("status", "active")
      .in("source", ["team_leader", "team_member"])
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check team contacts. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Join or invite a team member first." };
  }

  if (challenge.verification_logic?.startsWith("trust_event_confirmed:")) {
    const eventType = challenge.verification_logic.slice("trust_event_confirmed:".length);
    const trustProof = await hasConfirmedTrustEvent(supabase, userId, eventType);

    if (trustProof.error) {
      return { ok: false, reason: trustProof.error };
    }

    if (trustProof.proved) {
      return { ok: true };
    }

    return { ok: false, reason: "Ask another participant to confirm this action in your Trust confirmations first." };
  }

  if (challenge.verification_type === "manual") {
    return { ok: false, reason: "This challenge needs manual review before it can be completed." };
  }

  if (challenge.verification_type === "community") {
    return { ok: false, reason: "This challenge needs confirmation from another participant." };
  }

  return { ok: false, reason: "Verification is not connected for this challenge yet." };
}

async function hasConfirmedTrustEvent(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  eventType: string
): Promise<{ proved: boolean; error?: string }> {
  if (!isSupportedTrustEventType(eventType)) {
    return { proved: false, error: "Trust verification is not connected for this challenge yet." };
  }

  const trustClient = supabase as ReturnType<typeof createClient<any>>;
  const { data, error } = await trustClient
    .from("trust_events")
    .select("id")
    .eq("actor_user_id", userId)
    .eq("event_type", eventType)
    .eq("status", "confirmed")
    .limit(1);

  if (error) {
    return { proved: false, error: isMissingTrustSchemaError(error) ? "Trust confirmations are not available yet." : "Could not check Trust confirmations. Try again." };
  }

  return { proved: (data ?? []).length > 0 };
}

async function getChallengeProgressProof(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  challenge: ChallengeRow,
  proofKey: string
): Promise<{ proved: boolean; error?: string }> {
  const directProgress = await supabase
    .from("user_challenges")
    .select("verification_data")
    .eq("user_id", userId)
    .eq("challenge_id", challenge.id)
    .limit(1);

  if (directProgress.error) {
    return { proved: false, error: directProgress.error.message };
  }

  if (hasProof(directProgress.data?.[0]?.verification_data, proofKey)) {
    return { proved: true };
  }

  if (!challenge.verification_logic) {
    return { proved: false };
  }

  const relatedChallenges = await supabase
    .from("challenges")
    .select("id")
    .eq("is_active", true)
    .eq("verification_logic", challenge.verification_logic);

  if (relatedChallenges.error) {
    return { proved: false, error: relatedChallenges.error.message };
  }

  const relatedChallengeIds = Array.from(new Set((relatedChallenges.data ?? []).map((row) => row.id)));
  if (relatedChallengeIds.length === 0) {
    return { proved: false };
  }

  const relatedProgress = await supabase
    .from("user_challenges")
    .select("verification_data")
    .eq("user_id", userId)
    .in("challenge_id", relatedChallengeIds)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (relatedProgress.error) {
    return { proved: false, error: relatedProgress.error.message };
  }

  return {
    proved: (relatedProgress.data ?? []).some((row) => hasProof(row.verification_data, proofKey))
  };
}

function hasProof(value: unknown, proofKey: string): boolean {
  return isRecord(value) && value[proofKey] === true;
}

function wordCount(value: string | null | undefined): number {
  return (value ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function hasThreeSteps(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);

  if (lines.length >= 3) return true;

  const numbered = text.match(/(?:^|\s)(?:[1-3][.)]|шаг\s*[1-3]|step\s*[1-3])/gi) ?? [];
  return new Set(numbered.map((item) => item.replace(/\s+/g, "").toLowerCase())).size >= 3;
}

function getRewardAmount(value: Json): number {
  const raw = rewardLabelText(value);
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function rewardLabelText(value: Json): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, Json | undefined>;
    const en = record.en;
    const ru = record.ru;
    if (typeof en === "string") return en;
    if (typeof ru === "string") return ru;
  }

  return "1$";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedTrustEventType(value: string): boolean {
  return ["help_given", "help_received", "deal_completed", "challenge_confirmed", "proof_added"].includes(value);
}

function isMissingTrustSchemaError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "42P01"
    || code === "PGRST205"
    || message.includes("trust_events")
  ) && (
    message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("could not find the table")
  );
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
