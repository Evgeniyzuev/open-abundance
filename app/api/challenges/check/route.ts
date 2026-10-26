import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { classifyChallengeCheckReason } from "@/lib/challengeCheckReasons";
import { syncTodayForUser } from "@/lib/serverToday";
import { getChallengeAccessReasons, hasFirstResult, type ChallengeProgressWithCategory } from "@/lib/challengeEligibility";
import { salesThreshold, sumCompletedSales } from "@/lib/salesChallenges";
import { activeReferralsThreshold, confirmedReferralsThreshold } from "@/lib/creatorChallenges";
import { BUSINESS_BUYERS_TARGET, BUSINESS_REVIEWS_TARGET, distinctOthers, invitedBuyers, strangerBuyers } from "@/lib/businessChallenges";
import { GROWTH_TOPUP_MONTHS_TARGET, SPEND_SHIFT_PURCHASES_TARGET, SPEND_SHIFT_WINDOW_DAYS, countWithinDays, distinctMonths, topUpAfterWish } from "@/lib/growthChallenges";
import { dailyGoalRule, dayCreditStats } from "@/lib/dayCredit";
import { walletChallengeDone, walletChallengeRule, walletStats } from "@/lib/stayStreak";
import { hasThreeSteps } from "@/lib/wishSteps";
import { VALUES_CHALLENGE_SWIPES, valuesChallengeDone } from "@/lib/lifeValues";
import { CHANNEL_CODE_CHALLENGES, isChannelCodeLogic } from "@/lib/channelCodes";
import { isChannelCodeValid } from "@/lib/channelCodesServer";
import { APP_INSTALLED_LOGIC, FIRST_STEP_LOGIC } from "@/lib/questPath";

type CheckRequest = {
  challengeId?: string;
  /** Code of a "get a code" challenge (lib/channelCodes.ts). */
  code?: string;
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

  if (challenge.verification_logic === "peer_reviews") {
    return NextResponse.json({ error: "Peer reviews are settled by review submissions." }, { status: 409 });
  }

  const [{ data: coreAccount, error: coreError }, { data: progressRows, error: progressError }, { data: snapshots, error: snapshotError }] = await Promise.all([
    supabase.from("core_accounts").select("level").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_challenges").select("challenge_id,status,challenges(category)").eq("user_id", user.id),
    supabase.from("challenge_completion_snapshots").select("challenge_category").eq("user_id", user.id)
  ]);

  if (coreError || progressError || snapshotError) {
    return NextResponse.json({ error: coreError?.message ?? progressError?.message ?? snapshotError?.message ?? "Failed to load challenge eligibility." }, { status: 500 });
  }

  const progressStatuses = new Map((progressRows ?? []).map((row) => [row.challenge_id, String(row.status).trim().toLowerCase()]));
  const prerequisiteCompleted = !challenge.prerequisite_challenge_id || progressStatuses.get(challenge.prerequisite_challenge_id) === "completed";
  const accessReasons = getChallengeAccessReasons({ ...challenge, prerequisite_completed: prerequisiteCompleted }, Number(coreAccount?.level ?? 1));
  if (accessReasons.length > 0) {
    const reason = accessReasons.includes("first_result")
      ? "Publish your first non-onboarding result before inviting someone."
      : accessReasons.includes("prerequisite")
        ? "Complete the previous challenge first."
        : `Challenge requires Core level ${challenge.difficulty_level}.`;
    return NextResponse.json({ error: reason }, { status: 409 });
  }

  if (challenge.verification_logic !== "signup") {
    const { data: userChallenge, error: userChallengeError } = await supabase
      .from("user_challenges")
      .select("status")
      .eq("user_id", user.id)
      .eq("challenge_id", challenge.id)
      .maybeSingle();

    if (userChallengeError) {
      return NextResponse.json({ error: userChallengeError.message }, { status: 500 });
    }

    if (!userChallenge || !["accepted", "completed"].includes(userChallenge.status)) {
      return NextResponse.json({ status: "available", completed: false, message: "Accept the challenge before checking it." }, { status: 409 });
    }
  }

  const verification = await verifyChallenge(supabase, user.id, challenge, body.code);
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
      message: verification.reason,
      reasonCode: classifyChallengeCheckReason(verification.reason)
    });
  }

  const { data: completion, error: completionError } = await supabase.rpc("settle_user_challenge_rewards", {
    p_user_id: user.id,
    p_challenge_id: challenge.id
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
      properties: {
        core_reward_amount: Number(result.rewarded_core_amount ?? challenge.core_reward_amount),
        wallet_reward_amount: Number(result.rewarded_wallet_amount ?? challenge.wallet_reward_amount)
      },
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
    coreRewardAmount: Number(result?.rewarded_core_amount ?? challenge.core_reward_amount),
    walletRewardAmount: Number(result?.rewarded_wallet_amount ?? challenge.wallet_reward_amount)
  });
}

async function verifyChallenge(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  challenge: ChallengeRow,
  code?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = supabase as any;
  if (isChannelCodeLogic(challenge.verification_logic)) {
    const channel = CHANNEL_CODE_CHALLENGES[challenge.verification_logic];
    const valid = isChannelCodeValid(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", userId, channel, code, Date.now());
    return valid ? { ok: true } : { ok: false, reason: "Enter the code that came to you." };
  }
  if (challenge.verification_logic === APP_INSTALLED_LOGIC) {
    // The push code; the channel-code route sends it only to the app opened from the home screen.
    const valid = isChannelCodeValid(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", userId, "push", code, Date.now());
    return valid ? { ok: true } : { ok: false, reason: "Enter the code from the notification." };
  }
  if (challenge.verification_logic === FIRST_STEP_LOGIC) {
    const progress = await getChallengeProgressProof(supabase, userId, challenge, "motive_chosen");
    if (progress.error) return { ok: false, reason: "Could not check your answer. Try again." };
    return progress.proved ? { ok: true } : { ok: false, reason: "Choose an answer first." };
  }
  const acquisitionTarget = Number((challenge as any).acquisition_target ?? 0);
  if (challenge.verification_logic === "acquisition_publications_milestone") {
    const { count, error } = await db.from("acquisition_submissions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("submission_type", "publication").eq("status", "approved");
    if (error) return { ok: false, reason: "Could not check publication submissions. Try again." };
    return Number(count ?? 0) >= acquisitionTarget ? { ok: true } : { ok: false, reason: "Submit and pass review for " + acquisitionTarget + " publication(s)." };
  }
  if (challenge.verification_logic?.startsWith("acquisition_metric_")) {
    const metricKey = String((challenge as any).acquisition_metric_key ?? challenge.verification_logic.slice("acquisition_metric_".length));
    const { data, error } = await db.from("acquisition_submissions").select("id").eq("user_id", userId).eq("challenge_id", challenge.id).eq("submission_type", "metric").eq("metric_key", metricKey).eq("status", "approved").gte("metric_value", acquisitionTarget).limit(1);
    if (error) return { ok: false, reason: "Could not check quality evidence. Try again." };
    return (data ?? []).length > 0 ? { ok: true } : { ok: false, reason: "Submit quality evidence and pass peer review first." };
  }
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
    // A saved Core growth plan is the result: from the card's plan or from the calculator in Wallet.
    const [calculatorProgress, plan] = await Promise.all([
      getChallengeProgressProof(supabase, userId, challenge, "calculated"),
      supabase.from("user_core_growth_plans").select("id").eq("user_id", userId).eq("is_active", true).limit(1)
    ]);
    if (calculatorProgress.error || plan.error) {
      return { ok: false, reason: "Could not check calculator progress. Try again." };
    }
    if (calculatorProgress.proved || (plan.data?.length ?? 0) > 0) return { ok: true };
    return { ok: false, reason: "Save the plan to your wish first, then check this quest." };
  }

  if (challenge.verification_logic === "attention_value_audit") {
    const progress = await getChallengeProgressProof(supabase, userId, challenge, "attention_audit_completed");
    if (progress.error) return { ok: false, reason: "Could not check the attention estimate. Try again." };
    if (progress.proved) return { ok: true };
    return { ok: false, reason: "Complete and save the attention estimate first." };
  }

  if (challenge.verification_logic === "core_law_understood") {
    const progress = await getChallengeProgressProof(supabase, userId, challenge, "core_law_understood");
    if (progress.error) return { ok: false, reason: "Could not check the Core law test. Try again." };
    if (progress.proved) return { ok: true };
    return { ok: false, reason: "Pass the Core law test first." };
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

  if (challenge.verification_logic === "niche_task_chosen") {
    const progress = await getChallengeProgressProof(supabase, userId, challenge, "niche_task_chosen");
    if (progress.error) return { ok: false, reason: "Could not check your chosen direction. Try again." };
    if (progress.proved) return { ok: true };
    return { ok: false, reason: "Choose a direction and a first practical task first." };
  }

  if (challenge.verification_logic === "install_ping_answered") {
    const { data, error } = await db.rpc("install_ping_state", { p_user_id: userId });
    if (error) return { ok: false, reason: "Could not check the notification test. Try again." };
    if (data?.status === "completed") return { ok: true };
    if (data?.status === "failed") return { ok: false, reason: "The notification test was not completed in time. Start it again." };
    return { ok: false, reason: "Open the app within 3 minutes of a notification to complete this challenge." };
  }

  if (challenge.verification_logic === "humanity_confirmed") {
    const { data, error } = await db.from("humanity_verifications").select("humanity_level").eq("user_id", userId).maybeSingle();
    if (error) return { ok: false, reason: "Could not check your confirmation. Try again." };
    if (Number(data?.humanity_level ?? 0) >= 2) return { ok: true };
    return { ok: false, reason: "Complete \"I'm not a robot\" first." };
  }

  // "Author from scratch": invited people who passed the humanity check (level 2) are counted from the facts, not claimed.
  const confirmedTarget = confirmedReferralsThreshold(challenge.verification_logic);
  if (confirmedTarget !== null) {
    const { data: edges, error: edgesError } = await db
      .from("referral_edges")
      .select("referral_user_id")
      .eq("referrer_user_id", userId)
      .limit(5000);
    if (edgesError) return { ok: false, reason: "Could not check your invitations. Try again." };
    const invitedIds = ((edges ?? []) as Array<{ referral_user_id: string }>).map((edge) => edge.referral_user_id);
    let confirmed = 0;
    for (let start = 0; start < invitedIds.length && confirmed < confirmedTarget; start += 200) {
      const { count, error } = await db
        .from("humanity_verifications")
        .select("user_id", { count: "exact", head: true })
        .in("user_id", invitedIds.slice(start, start + 200))
        .gte("humanity_level", 2);
      if (error) return { ok: false, reason: "Could not check your invitations. Try again." };
      confirmed += Number(count ?? 0);
    }
    return confirmed >= confirmedTarget
      ? { ok: true }
      : { ok: false, reason: `${confirmed} of ${confirmedTarget} invited people have confirmed they are not a robot.` };
  }

  // "5/10 friends in action": an invited person is active once the "active" referral reward was paid for them
  // (any quest besides sign-up, migration 20261026120000).
  const activeTarget = activeReferralsThreshold(challenge.verification_logic);
  if (activeTarget !== null) {
    const { count, error } = await (db as any)
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("referrer_user_id", userId)
      .eq("kind", "active");
    if (error) return { ok: false, reason: "Could not check your invitations. Try again." };
    const active = Number(count ?? 0);
    return active >= activeTarget
      ? { ok: true }
      : { ok: false, reason: `${active} of ${activeTarget} invited people have done a quest.` };
  }

  // Sales: any completed Market deal where the person is the seller counts (founder decision 2026-10-17).
  if (challenge.verification_logic === "first_sale" || salesThreshold(challenge.verification_logic) !== null) {
    const { data, error } = await db
      .from("marketplace_deals")
      .select("price_amount")
      .eq("seller_user_id", userId)
      .eq("status", "completed")
      .limit(5000);
    if (error) return { ok: false, reason: "Could not check your sales. Try again." };
    const rows = (data ?? []) as Array<{ price_amount: number | string | null }>;
    const threshold = salesThreshold(challenge.verification_logic);
    if (threshold === null) {
      return rows.length > 0 ? { ok: true } : { ok: false, reason: "Complete your first sale in Wallet → Market first." };
    }
    return sumCompletedSales(rows.map((row) => row.price_amount)) >= threshold
      ? { ok: true }
      : { ok: false, reason: `Your completed sales must reach $${threshold}.` };
  }

  // "Own business" track: results are read from completed Market deals, published reviews and invitations.
  if (
    challenge.verification_logic === "business_second_buyer" ||
    challenge.verification_logic === "business_reviews_3" ||
    challenge.verification_logic === "business_stranger_buyer" ||
    challenge.verification_logic === "business_external_buyer"
  ) {
    const logic = challenge.verification_logic;
    if (logic === "business_reviews_3") {
      const { data, error } = await db
        .from("marketplace_reviews")
        .select("buyer_user_id")
        .eq("seller_user_id", userId)
        .eq("status", "published")
        .limit(5000);
      if (error) return { ok: false, reason: "Could not check your reviews. Try again." };
      const reviewers = distinctOthers(((data ?? []) as Array<{ buyer_user_id: string }>).map((row) => row.buyer_user_id), userId);
      return reviewers.length >= BUSINESS_REVIEWS_TARGET
        ? { ok: true }
        : { ok: false, reason: `${reviewers.length} of ${BUSINESS_REVIEWS_TARGET} different buyers have left a review.` };
    }

    const { data: deals, error: dealsError } = await db
      .from("marketplace_deals")
      .select("buyer_user_id")
      .eq("seller_user_id", userId)
      .eq("status", "completed")
      .limit(5000);
    if (dealsError) return { ok: false, reason: "Could not check your sales. Try again." };
    const buyers = distinctOthers(((deals ?? []) as Array<{ buyer_user_id: string }>).map((row) => row.buyer_user_id), userId);
    if (logic === "business_second_buyer") {
      return buyers.length >= BUSINESS_BUYERS_TARGET
        ? { ok: true }
        : { ok: false, reason: `${buyers.length} of ${BUSINESS_BUYERS_TARGET} different buyers have completed a deal with you.` };
    }

    // Stranger and external buyers must be verified people (humanity level 2).
    const confirmed: string[] = [];
    for (let start = 0; start < buyers.length; start += 200) {
      const { data, error } = await db
        .from("humanity_verifications")
        .select("user_id")
        .in("user_id", buyers.slice(start, start + 200))
        .gte("humanity_level", 2);
      if (error) return { ok: false, reason: "Could not check your buyers. Try again." };
      confirmed.push(...((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
    }

    const { data: outgoing, error: outError } = await db.from("referral_edges").select("referral_user_id").eq("referrer_user_id", userId).limit(5000);
    const { data: incoming, error: inError } = await db.from("referral_edges").select("referrer_user_id").eq("referral_user_id", userId).limit(50);
    if (outError || inError) return { ok: false, reason: "Could not check your invitations. Try again." };
    const invited = ((outgoing ?? []) as Array<{ referral_user_id: string }>).map((row) => row.referral_user_id);
    const inviter = ((incoming ?? []) as Array<{ referrer_user_id: string }>).map((row) => row.referrer_user_id);

    if (logic === "business_external_buyer") {
      return invitedBuyers(confirmed, invited).length > 0
        ? { ok: true }
        : { ok: false, reason: "A person who joined through your link and confirmed they are not a robot must complete a purchase from you." };
    }
    return strangerBuyers(confirmed, [...invited, ...inviter]).length > 0
      ? { ok: true }
      : { ok: false, reason: "A verified buyer you did not invite must complete a purchase from you." };
  }

  // First purchase inside Open Abundance: a completed Market deal as a buyer, or a shop purchase.
  if (challenge.verification_logic === "first_internal_purchase") {
    const { count: dealCount, error: dealError } = await db
      .from("marketplace_deals")
      .select("id", { count: "exact", head: true })
      .eq("buyer_user_id", userId)
      .eq("status", "completed");
    if (dealError) return { ok: false, reason: "Could not check your purchases. Try again." };
    if (Number(dealCount ?? 0) > 0) return { ok: true };
    const { count: shopCount, error: shopError } = await db
      .from("wallet_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("operation_type", "system_shop_purchase");
    if (shopError) return { ok: false, reason: "Could not check your purchases. Try again." };
    return Number(shopCount ?? 0) > 0 ? { ok: true } : { ok: false, reason: "Buy something from a member in Wallet → Market or in the Shop first." };
  }

  // Growth track (GROW-001): top-ups in three different months.
  if (challenge.verification_logic === "growth_core_topup_3months") {
    const { data, error } = await db
      .from("wallet_ledger")
      .select("created_at")
      .eq("user_id", userId)
      .eq("operation_type", "wallet_core_topup")
      .limit(5000);
    if (error) return { ok: false, reason: "Could not check your top-ups. Try again." };
    const months = distinctMonths(((data ?? []) as Array<{ created_at: string }>).map((row) => row.created_at));
    return months >= GROWTH_TOPUP_MONTHS_TARGET
      ? { ok: true }
      : { ok: false, reason: `Core was topped up in ${months} of ${GROWTH_TOPUP_MONTHS_TARGET} different months.` };
  }

  // Growth track: a Core top-up made for a wish (the wish has a target amount and the top-up came after it).
  if (challenge.verification_logic === "growth_wish_topup") {
    const { data: wishes, error: wishError } = await db
      .from("wishes")
      .select("created_at")
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .not("target_amount", "is", null)
      .gt("target_amount", 0)
      .limit(500);
    if (wishError) return { ok: false, reason: "Could not check your wishes. Try again." };
    if (!wishes || wishes.length === 0) return { ok: false, reason: "Add a wish with a target amount first." };
    const { data: topUps, error: topUpError } = await db
      .from("wallet_ledger")
      .select("created_at")
      .eq("user_id", userId)
      .eq("operation_type", "wallet_core_topup")
      .limit(5000);
    if (topUpError) return { ok: false, reason: "Could not check your top-ups. Try again." };
    return topUpAfterWish(
      (wishes as Array<{ created_at: string }>).map((row) => row.created_at),
      ((topUps ?? []) as Array<{ created_at: string }>).map((row) => row.created_at)
    )
      ? { ok: true }
      : { ok: false, reason: "Top up Core from Wallet after adding a wish with a target amount." };
  }

  // Growth track: the person marked spending to move inside and made three internal purchases in 60 days.
  if (challenge.verification_logic === "growth_spend_shift") {
    const { data: intent, error: intentError } = await db
      .from("user_spend_intents")
      .select("categories")
      .eq("user_id", userId)
      .maybeSingle();
    if (intentError) return { ok: false, reason: "Could not check your spending choices. Try again." };
    const categories = (intent as { categories?: string[] } | null)?.categories ?? [];
    if (categories.length === 0) return { ok: false, reason: "Choose which regular spending you want to move into Open Abundance first." };
    const since = new Date(Date.now() - SPEND_SHIFT_WINDOW_DAYS * 86_400_000).toISOString();
    const { data: deals, error: dealsError } = await db
      .from("marketplace_deals")
      .select("created_at")
      .eq("buyer_user_id", userId)
      .eq("status", "completed")
      .gte("created_at", since)
      .limit(500);
    if (dealsError) return { ok: false, reason: "Could not check your purchases. Try again." };
    const { data: shop, error: shopError } = await db
      .from("wallet_ledger")
      .select("created_at")
      .eq("user_id", userId)
      .eq("operation_type", "system_shop_purchase")
      .gte("created_at", since)
      .limit(500);
    if (shopError) return { ok: false, reason: "Could not check your purchases. Try again." };
    const stamps = [
      ...((deals ?? []) as Array<{ created_at: string }>).map((row) => row.created_at),
      ...((shop ?? []) as Array<{ created_at: string }>).map((row) => row.created_at),
    ];
    const purchases = countWithinDays(stamps, SPEND_SHIFT_WINDOW_DAYS, Date.now());
    return purchases >= SPEND_SHIFT_PURCHASES_TARGET
      ? { ok: true }
      : { ok: false, reason: `${purchases} of ${SPEND_SHIFT_PURCHASES_TARGET} purchases inside Open Abundance in the last ${SPEND_SHIFT_WINDOW_DAYS} days.` };
  }

  // The first fulfilled wish: any wish of the person with the status completed.
  if (challenge.verification_logic === "first_wish_fulfilled") {
    const { count, error } = await db
      .from("wishes")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null);
    if (error) return { ok: false, reason: "Could not check your wishes. Try again." };
    return Number(count ?? 0) > 0 ? { ok: true } : { ok: false, reason: "Mark one of your wishes as fulfilled first." };
  }

  // The first team task the leader has confirmed.
  if (challenge.verification_logic === "first_team_task_done") {
    const { count, error } = await db
      .from("team_tasks")
      .select("id", { count: "exact", head: true })
      .eq("member_user_id", userId)
      .eq("status", "completed");
    if (error) return { ok: false, reason: "Could not check your team tasks. Try again." };
    return Number(count ?? 0) > 0 ? { ok: true } : { ok: false, reason: "Complete a task from your lead and wait for the confirmation." };
  }

  if (challenge.verification_logic === "first_marketplace_listing") {
    const { count, error } = await db
      .from("marketplace_listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_user_id", userId)
      .in("status", ["active", "reserved", "sold"]);
    if (error) return { ok: false, reason: "Could not check your Market listings. Try again." };
    if (Number(count ?? 0) > 0) return { ok: true };
    return { ok: false, reason: "Publish your first listing in Wallet → Market first." };
  }

  if (challenge.verification_logic === "values_goals_defined") {
    const { data, error } = await db
      .from("user_values_profiles")
      .select("wheel_saved_at,swipe_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, reason: "Could not check your values and goals. Try again." };
    const state = { wheelSaved: Boolean(data?.wheel_saved_at), swipeCount: Number(data?.swipe_count ?? 0) };
    if (valuesChallengeDone(state)) return { ok: true };
    if (!state.wheelSaved) return { ok: false, reason: "Save your balance wheel first." };
    return { ok: false, reason: `Swipe ${VALUES_CHALLENGE_SWIPES} goal cards: ${state.swipeCount} done so far.` };
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

    if (wordCount(data?.bio) >= MIN_BIO_WORDS) {
      return { ok: true };
    }

    return { ok: false, reason: `Write at least ${MIN_BIO_WORDS} words in your profile bio about your skills, interests, or experience first.` };
  }

  if (challenge.verification_logic === "skill_profile_completed") {
    const [profileResult, linksResult] = await Promise.all([
      supabase.from("user_profiles").select("bio").eq("user_id", userId).maybeSingle(),
      supabase.from("user_profile_links").select("id").eq("user_id", userId).limit(1)
    ]);

    if (profileResult.error || linksResult.error) {
      return { ok: false, reason: "Could not check your skill profile. Try again." };
    }

    if (wordCount(profileResult.data?.bio) >= MIN_BIO_WORDS && (linksResult.data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: `Write at least ${MIN_BIO_WORDS} words in your profile bio and add at least one public or private proof link first.` };
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

  const dailyGoal = dailyGoalRule(challenge.verification_logic);
  if (dailyGoal) {
    try {
      const payload = await syncTodayForUser(supabase, userId);
      const { data: dayRows, error: dayError } = await supabase
        .from("user_today_instances")
        .select("local_date,status,progress_core,target_core")
        .eq("user_id", userId)
        .gte("local_date", daysBefore(payload.today.local_date, 120))
        .lte("local_date", payload.today.local_date);
      if (dayError) throw dayError;
      const stats = dayCreditStats(dayRows ?? [], payload.today.local_date);
      const value = dailyGoal.kind === "counted_streak" ? stats.countedStreak : stats.fullTotal;
      if (value >= dailyGoal.days) return { ok: true };
      return {
        ok: false,
        reason: dailyGoal.kind === "counted_streak"
          ? `Reach at least half of the daily Core target for ${dailyGoal.days} days in a row. Current streak: ${stats.countedStreak}.`
          : `Reach the full daily Core target on ${dailyGoal.days} days. Full days so far: ${stats.fullTotal}.`
      };
    } catch {
      return { ok: false, reason: "Could not check the daily goal. Try again." };
    }
  }

  const walletRule = walletChallengeRule(challenge.verification_logic);
  if (walletRule) {
    const { data: ledger, error: ledgerError } = await supabase
      .from("wallet_ledger")
      .select("operation_type,direction,amount,created_at")
      .eq("user_id", userId)
      .in("operation_type", ["crypto_deposit", "crypto_withdrawal"]);
    if (ledgerError) return { ok: false, reason: "Could not check the Wallet history. Try again." };
    // A streak counts from the moment the previous step of the chain was completed.
    let since: Date | null = null;
    if (walletRule.kind === "stay" && challenge.prerequisite_challenge_id) {
      const { data: previous } = await db.from("user_challenges").select("status,updated_at,reward_settled_at").eq("user_id", userId).eq("challenge_id", challenge.prerequisite_challenge_id).maybeSingle();
      const doneAt = Date.parse(String(previous?.reward_settled_at ?? previous?.updated_at ?? ""));
      if (previous?.status === "completed" && Number.isFinite(doneAt)) since = new Date(doneAt);
    }
    const stats = walletStats(ledger ?? [], new Date(), since);
    if (walletChallengeDone(walletRule, stats)) return { ok: true };
    if (walletRule.kind === "first_deposit") return { ok: false, reason: "Top up your Wallet first." };
    if (walletRule.kind === "net_deposit") return { ok: false, reason: `Net top-ups so far: $${stats.netDeposit.toFixed(2)} of $${walletRule.amount}.` };
    return { ok: false, reason: `Keep your abundance in the app for ${walletRule.days} days without withdrawals. Days so far: ${stats.streakDays}.` };
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

  if (challenge.verification_logic === "day_2_return") {
    const { data: acceptance, error: acceptanceError } = await supabase
      .from("user_challenges")
      .select("created_at")
      .eq("user_id", userId)
      .eq("challenge_id", challenge.id)
      .maybeSingle();

    if (acceptanceError) {
      return { ok: false, reason: "Could not check the challenge acceptance. Try again." };
    }

    if (!acceptance?.created_at) {
      return { ok: false, reason: "Accept the challenge first." };
    }

    const acceptedAt = new Date(acceptance.created_at);
    if (Number.isNaN(acceptedAt.getTime())) {
      return { ok: false, reason: "Could not read the acceptance date. Try again." };
    }

    const returnDayStart = new Date(Date.UTC(acceptedAt.getUTCFullYear(), acceptedAt.getUTCMonth(), acceptedAt.getUTCDate() + 1));
    const returnDayEnd = new Date(returnDayStart.getTime() + 24 * 60 * 60 * 1000);
    const returnLocalDate = returnDayStart.toISOString().slice(0, 10);

    const [openResult, todayResult] = await Promise.all([
      supabase
        .from("product_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_name", "app_open")
        .gte("created_at", returnDayStart.toISOString())
        .lt("created_at", returnDayEnd.toISOString())
        .limit(1),
      supabase
        .from("user_today_instances")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "completed")
        .eq("local_date", returnLocalDate)
        .limit(1)
    ]);

    if (openResult.error || todayResult.error) {
      return { ok: false, reason: "Could not check the next-day visit. Try again." };
    }

    if ((openResult.data ?? []).length > 0 || (todayResult.data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Come back tomorrow and open the app or complete Today." };
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

  if (challenge.verification_logic === "afterburn_over_5") {
    const { data, error } = await db
      .from("core_afterburn_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "moved")
      .gt("amount", 5)
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check Afterburn moves. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Turn on Afterburn and keep more than $5 in Wallet above the kept amount until the night move." };
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
    const [{ data: snapshots, error: snapshotError }, { data, error }, { data: progressRows, error: progressError }] = await Promise.all([
      supabase
        .from("challenge_completion_snapshots")
        .select("challenge_category")
        .eq("user_id", userId),
      supabase
        .from("referral_edges")
        .select("referral_user_id")
        .eq("referrer_user_id", userId)
        .limit(1),
      supabase
        .from("user_challenges")
        .select("status,challenges(category)")
        .eq("user_id", userId)
    ]);

    if (snapshotError || error || progressError) {
      return { ok: false, reason: "Could not check referrals. Try again." };
    }

    if (!hasFirstResult(snapshots ?? [], (progressRows ?? []) as unknown as ChallengeProgressWithCategory[])) {
      return { ok: false, reason: "Publish your first non-onboarding result before inviting someone." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Invite one person who completes registration first." };
  }

  if (challenge.verification_logic === "team_task_help_completed") {
    const { data, error } = await supabase
      .from("team_tasks")
      .select("id")
      .eq("leader_user_id", userId)
      .eq("status", "completed")
      .eq("newcomer_eligible", true)
      .limit(1);

    if (error) {
      return { ok: false, reason: "Could not check team help tasks. Try again." };
    }

    if ((data ?? []).length > 0) {
      return { ok: true };
    }

    return { ok: false, reason: "Complete one task for a newcomer in Teams first." };
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

/** Words in a text; the bio can be edited later, so the challenge only asks for a short real description. */
function wordCount(value: string | null | undefined): number {
  return (value ?? "").trim().split(/\s+/).filter(Boolean).length;
}

const MIN_BIO_WORDS = 5;

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

function daysBefore(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}
