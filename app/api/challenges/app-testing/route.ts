import { NextRequest, NextResponse } from "next/server";
import {
  APP_TESTING_CHALLENGE_ID,
  APP_TESTING_CONSENT_VERSION,
  normalizeAppTestingDraft,
  validateAppTestingSubmission
} from "@/lib/appTestingFeedback";
import type { Database, TablesInsert } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { syncTodayForUser } from "@/lib/serverToday";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const [{ data: submission, error: submissionError }, { data: progress, error: progressError }] = await Promise.all([
      supabase
        .from("challenge_feedback_submissions")
        .select("*")
        .eq("user_id", user.id)
        .eq("challenge_id", APP_TESTING_CHALLENGE_ID)
        .maybeSingle(),
      supabase
        .from("user_challenges")
        .select("status")
        .eq("user_id", user.id)
        .eq("challenge_id", APP_TESTING_CHALLENGE_ID)
        .maybeSingle()
    ]);

    if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (progressError) return NextResponse.json({ error: progressError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json(
      {
        draft: submission ? serializeSubmission(submission) : null,
        challengeStatus: progress?.status ?? null
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load app testing feedback." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const rawBody = await request.json().catch(() => ({}));
    const draft = normalizeAppTestingDraft(rawBody);
    const { data: progress, error: progressError } = await supabase
      .from("user_challenges")
      .select("status")
      .eq("user_id", user.id)
      .eq("challenge_id", APP_TESTING_CHALLENGE_ID)
      .maybeSingle();

    if (progressError) return NextResponse.json({ error: progressError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!progress) return NextResponse.json({ error: "Accept the challenge before saving feedback." }, { status: 409, headers: NO_STORE_HEADERS });

    const { data: existing, error: existingError } = await supabase
      .from("challenge_feedback_submissions")
      .select("status")
      .eq("user_id", user.id)
      .eq("challenge_id", APP_TESTING_CHALLENGE_ID)
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (existing?.status === "submitted") {
      return NextResponse.json({ saved: true, submitted: true }, { headers: NO_STORE_HEADERS });
    }

    const row: TablesInsert<"challenge_feedback_submissions"> = {
      user_id: user.id,
      challenge_id: APP_TESTING_CHALLENGE_ID,
      schema_version: draft.schemaVersion,
      status: "draft",
      platform: draft.platform,
      install_outcome: draft.installOutcome || null,
      answers: draft.answers,
      overall_rating: draft.overallRating || null,
      most_useful_area: draft.mostUsefulArea || null,
      daily_use_intent: draft.dailyUseIntent || null,
      main_difficulty: draft.mainDifficulty || null,
      private_comment: draft.privateComment || null,
      mission_rating: draft.missionRating || null,
      attitude: draft.attitude || null,
      strongest_area: draft.strongestArea || null,
      main_concern: draft.mainConcern || null,
      public_review: draft.publicReview || null,
      context: draft.context
    };
    const { error: saveError } = await supabase
      .from("challenge_feedback_submissions")
      .upsert(row, { onConflict: "user_id,challenge_id" });

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ saved: true, submitted: false }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to save app testing feedback." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const rawBody = await request.json().catch(() => ({}));
    const draft = normalizeAppTestingDraft(rawBody);
    draft.publicConsent = rawBody?.publicConsent === true;
    const validationError = validateAppTestingSubmission(draft);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers: NO_STORE_HEADERS });

    const { data, error: submitError } = await supabase.rpc("submit_app_testing_feedback", {
      p_user_id: user.id,
      p_challenge_id: APP_TESTING_CHALLENGE_ID,
      p_schema_version: draft.schemaVersion,
      p_platform: draft.platform,
      p_install_outcome: draft.installOutcome,
      p_answers: draft.answers,
      p_overall_rating: draft.overallRating,
      p_most_useful_area: draft.mostUsefulArea,
      p_daily_use_intent: draft.dailyUseIntent,
      p_main_difficulty: draft.mainDifficulty,
      p_private_comment: draft.privateComment,
      p_mission_rating: draft.missionRating,
      p_attitude: draft.attitude,
      p_strongest_area: draft.strongestArea,
      p_main_concern: draft.mainConcern,
      p_public_review: draft.publicReview,
      p_context: draft.context,
      p_consent_version: APP_TESTING_CONSENT_VERSION
    });

    if (submitError) return NextResponse.json({ error: submitError.message }, { status: 400, headers: NO_STORE_HEADERS });
    const result = data?.[0];
    await syncTodayForUser(supabase, user.id).catch(() => undefined);

    if (result?.reward_claimed) {
      await recordProductEvent({
        entityId: APP_TESTING_CHALLENGE_ID,
        entityType: "challenge",
        eventName: "challenge_completed",
        properties: { reward_account: "core", reward_amount: Number(result.rewarded_amount ?? 3) },
        source: "server",
        userId: user.id
      });
      if (result?.feed_post_id) {
        await supabase.from("feed_posts").update({ status: "draft", published_at: null }).eq("id", result.feed_post_id).eq("author_user_id", user.id);
        const { count } = await supabase.from("feed_post_media").select("id", { count: "exact", head: true }).eq("post_id", result.feed_post_id);
        if (!count) {
          await supabase.from("feed_post_media").insert({
            post_id: result.feed_post_id,
            media_type: "image",
            media_url: "/feed/system-events/challenge-completed.png",
            alt_text: {},
            sort_order: 0,
            metadata: { origin: "system_template", templateKey: "challenge_completed" }
          });
        }
      }
      await recordProductEvent({
        entityId: result.feed_post_id ?? undefined,
        entityType: "feed_post",
        eventName: "app_testing_review_published",
        properties: { overall_rating: draft.overallRating, mission_rating: draft.missionRating },
        source: "server",
        userId: user.id
      });
    }

    const { data: core, error: coreError } = await supabase
      .from("core_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (coreError) return NextResponse.json({ error: coreError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json(
      {
        completed: true,
        challengeId: APP_TESTING_CHALLENGE_ID,
        status: result?.challenge_status ?? "completed",
        submissionId: result?.submission_id ?? null,
        feedPostId: result?.feed_post_id ?? null,
        rewardClaimed: Boolean(result?.reward_claimed),
        rewardAccount: "core",
        rewardAmount: Number(result?.rewarded_amount ?? 3),
        core
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to submit app testing feedback." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function serializeSubmission(row: Database["public"]["Tables"]["challenge_feedback_submissions"]["Row"]) {
  return {
    schemaVersion: row.schema_version,
    platform: row.platform,
    installOutcome: row.install_outcome,
    answers: row.answers,
    overallRating: row.overall_rating,
    mostUsefulArea: row.most_useful_area,
    dailyUseIntent: row.daily_use_intent,
    mainDifficulty: row.main_difficulty,
    privateComment: row.private_comment,
    missionRating: row.mission_rating,
    attitude: row.attitude,
    strongestArea: row.strongest_area,
    mainConcern: row.main_concern,
    publicReview: row.public_review,
    context: row.context,
    status: row.status,
    feedPostId: row.feed_post_id
  };
}
