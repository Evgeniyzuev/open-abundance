import { NextRequest, NextResponse } from "next/server";
import { AI_ESSAY_CHALLENGE_ID, AI_ESSAY_DISCUSSION_POST_ID, normalizeEssayBody } from "@/lib/aiEssay";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const FIELDS = "id,body,publish_consent,feed_comment_id,status,score,scores,feedback,reviewed_at,core_reward_amount,wallet_reward_amount,submitted_at";

/** GET /api/challenges/essay — the signed-in person's answer to the AI-checked essay challenge and its review. */
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const db = createServiceSupabaseClient() as any;
  const { data, error: readError } = await db
    .from("challenge_essay_submissions")
    .select(FIELDS)
    .eq("user_id", user.id)
    .eq("challenge_id", AI_ESSAY_CHALLENGE_ID)
    .maybeSingle();
  if (readError) return json({ submission: null, discussionPostId: AI_ESSAY_DISCUSSION_POST_ID }, 200);
  return json({ submission: data ?? null, discussionPostId: AI_ESSAY_DISCUSSION_POST_ID }, 200);
}

/**
 * POST /api/challenges/essay { body, publish } — submits (or, after "needs work", resubmits) the answer for AI review.
 * With `publish` the answer also appears as the person's comment in the public discussion thread.
 */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const payload = await request.json().catch(() => null) as { body?: unknown; publish?: unknown } | null;
  const body = normalizeEssayBody(payload?.body);
  if (!body) return json({ error: "The answer must be 500 to 4000 characters." }, 400);
  const publish = payload?.publish === true;
  const db = createServiceSupabaseClient() as any;

  const { data: progress, error: progressError } = await db
    .from("user_challenges")
    .select("status")
    .eq("user_id", user.id)
    .eq("challenge_id", AI_ESSAY_CHALLENGE_ID)
    .maybeSingle();
  if (progressError) return json({ error: progressError.message }, 500);
  if (!progress) return json({ error: "Accept the challenge first." }, 409);

  const { data: existing, error: existingError } = await db
    .from("challenge_essay_submissions")
    .select("id,status,feed_comment_id")
    .eq("user_id", user.id)
    .eq("challenge_id", AI_ESSAY_CHALLENGE_ID)
    .maybeSingle();
  if (existingError) return json({ error: existingError.message }, 500);
  if (existing?.status === "scored") return json({ error: "This answer has already been scored." }, 409);

  const now = new Date().toISOString();
  const { data: saved, error: saveError } = await db
    .from("challenge_essay_submissions")
    .upsert({
      user_id: user.id,
      challenge_id: AI_ESSAY_CHALLENGE_ID,
      body,
      publish_consent: publish,
      status: "submitted",
      submitted_at: now,
      updated_at: now
    }, { onConflict: "user_id,challenge_id" })
    .select("id,feed_comment_id")
    .single();
  if (saveError || !saved) return json({ error: saveError?.message ?? "Could not save the answer." }, 500);

  // The thread copy follows the latest text; withdrawing consent hides the comment.
  let commentId: string | null = saved.feed_comment_id ?? null;
  if (publish && commentId) {
    await db.from("feed_post_comments").update({ body, deleted_at: null, updated_at: now }).eq("id", commentId).eq("user_id", user.id);
  } else if (publish) {
    const { data: comment } = await db
      .from("feed_post_comments")
      .upsert({ post_id: AI_ESSAY_DISCUSSION_POST_ID, user_id: user.id, body, client_idempotency_key: `essay:${saved.id}` }, { onConflict: "user_id,client_idempotency_key" })
      .select("id")
      .single();
    commentId = comment?.id ?? null;
    if (commentId) await db.from("challenge_essay_submissions").update({ feed_comment_id: commentId }).eq("id", saved.id);
  } else if (commentId) {
    await db.from("feed_post_comments").update({ deleted_at: now }).eq("id", commentId).eq("user_id", user.id);
  }

  await recordProductEvent({ eventName: "ai_essay_submitted", userId: user.id, entityType: "challenge", entityId: AI_ESSAY_CHALLENGE_ID, properties: { published: publish, chars: body.length, resubmitted: Boolean(existing) } });
  return json({ submitted: true, published: Boolean(publish && commentId), discussionPostId: AI_ESSAY_DISCUSSION_POST_ID }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
