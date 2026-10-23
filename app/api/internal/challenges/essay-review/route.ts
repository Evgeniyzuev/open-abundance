import { NextRequest, NextResponse } from "next/server";
import { AI_ESSAY_CHALLENGE_ID, ESSAY_RUBRIC, essayTotalScore, type EssayCriterion } from "@/lib/aiEssay";
import { authorizeClaudeOrOperator } from "@/lib/claudeActionsAuth";
import { analyticsSalt, pseudonymize } from "@/lib/dailyAnalytics";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

/**
 * GET /api/internal/challenges/essay-review — answers waiting for AI review: id, author pseudonym, text, language.
 * POST /api/internal/challenges/essay-review { submissionId, scores: { relevance, depth, personal, novelty, clarity }, feedback }
 *   scores the answer (weighted total, see ESSAY_RUBRIC), pays base × score% (Core up to 80, Wallet above 80) and
 *   notifies the person. Under 30% the answer goes back for rework. Callers: operator or Claude (CLAUDE_ACTIONS_TOKEN).
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const salt = analyticsSalt(process.env);
  if (!salt) return json({ error: "Analytics salt is not configured." }, 500);
  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db
    .from("challenge_essay_submissions")
    .select("id,user_id,body,publish_consent,submitted_at")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(50);
  if (error) return json({ error: error.message }, 500);
  const userIds = [...new Set((data ?? []).map((row: any) => row.user_id))];
  const { data: profiles } = userIds.length
    ? await db.from("user_profiles").select("user_id,default_locale").in("user_id", userIds)
    : { data: [] };
  const locales = new Map((profiles ?? []).map((row: any) => [row.user_id, row.default_locale]));
  return json({
    rubric: ESSAY_RUBRIC,
    pending: (data ?? []).map((row: any) => ({
      submissionId: row.id,
      person: pseudonymize(row.user_id, salt),
      locale: locales.get(row.user_id) ?? "en",
      published: row.publish_consent,
      submittedAt: row.submitted_at,
      body: row.body
    }))
  }, 200);
}

export async function POST(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const payload = await request.json().catch(() => null) as { submissionId?: unknown; scores?: Record<string, unknown>; feedback?: unknown } | null;
  const submissionId = typeof payload?.submissionId === "string" ? payload.submissionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return json({ error: "submissionId is required." }, 400);
  const scores: Partial<Record<EssayCriterion, number>> = {};
  for (const item of ESSAY_RUBRIC) {
    const value = Number(payload?.scores?.[item.key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) return json({ error: `scores.${item.key} must be 0 to 100.` }, 400);
    scores[item.key] = Math.round(value);
  }
  const feedback = typeof payload?.feedback === "string" ? payload.feedback.trim().slice(0, 1500) : "";
  if (feedback.length < 20) return json({ error: "feedback (20+ characters) is required: the person sees why." }, 400);
  const score = essayTotalScore(scores);

  const db = createServiceSupabaseClient() as any;
  const { data: submission, error: readError } = await db
    .from("challenge_essay_submissions")
    .select("user_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (readError) return json({ error: readError.message }, 500);
  if (!submission) return json({ error: "Submission not found." }, 404);

  const { data, error } = await db.rpc("review_challenge_essay", {
    p_submission_id: submissionId,
    p_score: score,
    p_scores: scores,
    p_feedback: feedback,
    p_reviewer: auth.byToken ? "claude" : "operator"
  });
  if (error) return json({ error: error.message }, 500);
  const result = Array.isArray(data) ? data[0] : data;

  const { data: profile } = await db.from("user_profiles").select("default_locale").eq("user_id", submission.user_id).maybeSingle();
  const ru = profile?.default_locale === "ru";
  const passed = result?.result_status === "scored";
  await db.rpc("create_notification_event_raw", {
    p_event_type: "challenge.ai_review",
    p_category: "rewards",
    p_source_type: "challenge_essay",
    p_source_id: submissionId,
    p_title: ru ? `Ответ оценён: ${score}%` : `Your answer scored ${score}%`,
    p_body: passed
      ? (ru ? `Начислено: Core +${result.result_core}${Number(result.result_wallet) > 0 ? `, Wallet +${result.result_wallet}` : ""}. Отзыв ИИ — в челлендже.` : `Credited: Core +${result.result_core}${Number(result.result_wallet) > 0 ? `, Wallet +${result.result_wallet}` : ""}. AI feedback is in the challenge.`)
      : (ru ? "Ответ вернулся на доработку. Подсказки ИИ — в челлендже." : "Your answer came back for rework. AI tips are in the challenge."),
    p_deep_link: "/?view=challenges",
    p_recipient_user_ids: [submission.user_id],
    p_idempotency_key: `challenge_essay:${submissionId}:${result?.result_status ?? "x"}:${score}`,
    p_metadata: { challenge_id: AI_ESSAY_CHALLENGE_ID, score },
    p_push: true
  });

  return json({ score, status: result?.result_status ?? null, core: result?.result_core ?? 0, wallet: result?.result_wallet ?? 0 }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
