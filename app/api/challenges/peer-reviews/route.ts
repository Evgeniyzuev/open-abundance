import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { isGrowthOperator } from "@/lib/growthOperator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PEER_REVIEWS_CHALLENGE_ID = "55bb0d7b-ef78-46f8-9c02-c8ba42d01f21";
const REVIEW_STATUSES = ["offered", "accepted", "submitted"] as const;
const CHECKLIST_KEYS = [
  "url_accessible",
  "allowed_platform",
  "visual_cover",
  "title_context",
  "referral_link",
  "no_spam"
] as const;

type ReviewAction = "next" | "accept" | "decline" | "submit" | "audit" | "operator_finalize";

type ReviewBody = {
  action?: ReviewAction;
  answerId?: string;
  taskId?: string;
  verdict?: "pass" | "fail";
  checklist?: Record<string, boolean>;
  notes?: string;
  declineReason?: string;
  qualityStatus?: "valid" | "invalid";
  reason?: string;
};

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const db = supabase as any;
  const progress = await getProgress(db, user.id);
  const current = progress.accepted ? await getOrOfferTask(db, user.id) : null;

  return NextResponse.json({
    challengeId: PEER_REVIEWS_CHALLENGE_ID,
    progress,
    current
  }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => ({}))) as ReviewBody;
  const action = body.action ?? "next";
  const db = supabase as any;

  if (action === "next") {
    const progress = await getProgress(db, user.id);
    if (!progress.accepted) return NextResponse.json({ error: "Accept the Peer reviews challenge first." }, { status: 409, headers: NO_STORE_HEADERS });
    const current = await getOrOfferTask(db, user.id);
    return NextResponse.json({ current, progress }, { headers: NO_STORE_HEADERS });
  }

  if (action === "audit") {
    if (!isGrowthOperator(user.id)) return NextResponse.json({ error: "Operator access required." }, { status: 403, headers: NO_STORE_HEADERS });
    if (!body.answerId || !isUuid(body.answerId) || !body.qualityStatus) return NextResponse.json({ error: "Answer and quality status are required." }, { status: 400, headers: NO_STORE_HEADERS });
    const { data, error: auditError } = await db.rpc("audit_peer_review_answer", {
      p_answer_id: body.answerId,
      p_quality_status: body.qualityStatus,
      p_reason: body.reason?.trim() || null
    });
    if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ audit: data?.[0] ?? null }, { headers: NO_STORE_HEADERS });
  }

  if (action === "operator_finalize") {
    if (!isGrowthOperator(user.id)) return NextResponse.json({ error: "Operator access required." }, { status: 403, headers: NO_STORE_HEADERS });
    if (!body.taskId || !isUuid(body.taskId) || !body.verdict) return NextResponse.json({ error: "Task and verdict are required." }, { status: 400, headers: NO_STORE_HEADERS });
    const result = await operatorFinalize(db, body.taskId, body.verdict);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  }

  if (!body.answerId || !isUuid(body.answerId)) return NextResponse.json({ error: "Review answer is required." }, { status: 400, headers: NO_STORE_HEADERS });

  const progress = await getProgress(db, user.id);
  if (!progress.accepted) return NextResponse.json({ error: "Accept the Peer reviews challenge first." }, { status: 409, headers: NO_STORE_HEADERS });

  const { data: answer, error: answerError } = await db
    .from("peer_review_answers")
    .select("id,task_id,status,reviewer_user_id,declined_after_accept,peer_review_tasks!inner(id,status,source_submission_id,required_reviews,pass_threshold,due_at,acquisition_submissions!inner(id,user_id,challenge_id,submission_type,status))")
    .eq("id", body.answerId)
    .eq("reviewer_user_id", user.id)
    .maybeSingle();

  if (answerError || !answer) return NextResponse.json({ error: answerError?.message ?? "Review answer not found." }, { status: 404, headers: NO_STORE_HEADERS });
  if (answer.peer_review_tasks?.status === "settled") return NextResponse.json({ error: "This review task is already closed." }, { status: 409, headers: NO_STORE_HEADERS });

  if (action === "accept") {
    if (answer.status !== "offered") return NextResponse.json({ error: "This task is no longer available to accept." }, { status: 409, headers: NO_STORE_HEADERS });
    const { error: updateError } = await db.from("peer_review_answers").update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", answer.id).eq("reviewer_user_id", user.id).eq("status", "offered");
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ status: "accepted", current: await getOrOfferTask(db, user.id) }, { headers: NO_STORE_HEADERS });
  }

  if (action === "decline") {
    if (!["offered", "accepted"].includes(answer.status)) return NextResponse.json({ error: "This task can no longer be declined." }, { status: 409, headers: NO_STORE_HEADERS });
    const afterAccept = answer.status === "accepted";
    const { error: updateError } = await db.from("peer_review_answers").update({
      status: "declined",
      declined_after_accept: afterAccept,
      decline_reason: body.declineReason?.trim() || null,
      updated_at: new Date().toISOString()
    }).eq("id", answer.id).eq("reviewer_user_id", user.id).in("status", ["offered", "accepted"]);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    await reopenTaskIfNeeded(db, answer.task_id);
    await recordProductEvent({ entityId: answer.id, entityType: "peer_review_answer", eventName: "peer_review_declined", properties: { after_accept: afterAccept }, source: "server", userId: user.id });
    return NextResponse.json({ status: "declined", current: await getOrOfferTask(db, user.id), progress: await getProgress(db, user.id) }, { headers: NO_STORE_HEADERS });
  }

  if (action === "submit") {
    if (answer.status !== "accepted") return NextResponse.json({ error: "Accept the task before submitting a review." }, { status: 409, headers: NO_STORE_HEADERS });
    const checklistError = validateChecklist(body.checklist);
    if (checklistError) return NextResponse.json({ error: checklistError }, { status: 400, headers: NO_STORE_HEADERS });
    if (!body.verdict || !["pass", "fail"].includes(body.verdict)) return NextResponse.json({ error: "Choose a verdict." }, { status: 400, headers: NO_STORE_HEADERS });
    const notes = body.notes?.trim() ?? "";
    if (notes.length < 8) return NextResponse.json({ error: "Add a short reason for the verdict." }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: updateError } = await db.from("peer_review_answers").update({
      status: "submitted",
      verdict: body.verdict,
      checklist: body.checklist,
      notes,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", answer.id).eq("reviewer_user_id", user.id).eq("status", "accepted");
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const settlement = await settleTaskIfReady(db, answer.task_id);
    const { data: settledAnswer } = await db.from("peer_review_answers").select("reward_amount,reward_status").eq("id", answer.id).maybeSingle();
    const ownReward = Number(settledAnswer?.reward_amount ?? 0);
    await recordProductEvent({ entityId: answer.id, entityType: "peer_review_answer", eventName: "peer_review_submitted", properties: { verdict: body.verdict, task_status: settlement.taskStatus }, source: "server", userId: user.id });

    return NextResponse.json({
      status: "submitted",
      taskStatus: settlement.taskStatus,
      reward: ownReward,
      rewardStatus: settledAnswer?.reward_status ?? "pending",
      authorCompleted: settlement.authorCompleted,
      progress: await getProgress(db, user.id),
      current: await getOrOfferTask(db, user.id)
    }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ error: "Unsupported review action." }, { status: 400, headers: NO_STORE_HEADERS });
}

async function getOrOfferTask(db: any, userId: string): Promise<any> {
  const { data: activeAnswer } = await db
    .from("peer_review_answers")
    .select("id,status,verdict,checklist,notes,peer_review_tasks!inner(id,status,source_submission_id,required_reviews,pass_threshold,due_at,final_verdict,acquisition_submissions!inner(id,user_id,challenge_id,submission_type,canonical_url,platform,title,body_excerpt,cover_url,referral_url,metric_key,metric_value,metric_evidence_url,status,created_at))")
    .eq("reviewer_user_id", userId)
    .in("status", [...REVIEW_STATUSES])
    .neq("peer_review_tasks.status", "settled")
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeAnswer) return normalizeCurrent(activeAnswer);

  const { data: tasks, error: taskError } = await db
    .from("peer_review_tasks")
    .select("id,status,source_submission_id,required_reviews,pass_threshold,due_at,final_verdict,acquisition_submissions!inner(id,user_id,challenge_id,submission_type,canonical_url,platform,title,body_excerpt,cover_url,referral_url,metric_key,metric_value,metric_evidence_url,status,created_at)")
    .in("status", ["open", "in_review"])
    .eq("acquisition_submissions.status", "pending_review")
    .order("created_at", { ascending: true })
    .limit(50);

  if (taskError) throw new Error(taskError.message);

  for (const task of tasks ?? []) {
    const source = task.acquisition_submissions;
    if (!source || source.user_id === userId) continue;

    const { data: existing } = await db.from("peer_review_answers")
      .select("id,status")
      .eq("task_id", task.id)
      .eq("reviewer_user_id", userId)
      .maybeSingle();

    if (existing) continue;

    const { data: answer, error: answerError } = await db.from("peer_review_answers").insert({
      task_id: task.id,
      reviewer_user_id: userId,
      status: "offered"
    }).select("id,status,verdict,checklist,notes,peer_review_tasks!inner(id,status,source_submission_id,required_reviews,pass_threshold,due_at,final_verdict,acquisition_submissions!inner(id,user_id,challenge_id,submission_type,canonical_url,platform,title,body_excerpt,cover_url,referral_url,metric_key,metric_value,metric_evidence_url,status,created_at))").single();

    if (!answerError && answer) {
      await db.from("peer_review_tasks").update({ status: "in_review", updated_at: new Date().toISOString() }).eq("id", task.id).in("status", ["open", "in_review"]);
      return normalizeCurrent(answer);
    }
  }

  return null;
}

async function settleTaskIfReady(db: any, taskId: string): Promise<{ taskStatus: string; reward: number; authorCompleted: boolean }> {
  const { data: task } = await db.from("peer_review_tasks")
    .select("id,status,required_reviews,pass_threshold,source_submission_id,acquisition_submissions!inner(id,user_id,challenge_id,status)")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || task.status === "settled") return { taskStatus: task?.status ?? "unknown", reward: 0, authorCompleted: false };

  const { data: answers } = await db.from("peer_review_answers")
    .select("id,reviewer_user_id,verdict,status")
    .eq("task_id", taskId)
    .eq("status", "submitted");

  if ((answers ?? []).length < Number(task.required_reviews ?? 3)) return { taskStatus: "in_review", reward: 0, authorCompleted: false };

  const passCount = (answers ?? []).filter((answer: any) => answer.verdict === "pass").length;
  const finalVerdict = passCount >= Number(task.pass_threshold ?? 2) ? "pass" : "fail";
  const { data: settledTask, error: updateError } = await db.from("peer_review_tasks")
    .update({ status: "settled", final_verdict: finalVerdict, finalised_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", task.status)
    .select("id")
    .maybeSingle();

  if (updateError || !settledTask) return { taskStatus: "settled", reward: 0, authorCompleted: false };

  let reviewerReward = 0;
  for (const answer of answers ?? []) {
    const { data: rewardData } = await db.rpc("settle_peer_review_answer", { p_answer_id: answer.id, p_quality_status: "valid", p_reason: null });
    const reward = Number(rewardData?.[0]?.reward_amount ?? 0);
    reviewerReward += reward;
  }

  let authorCompleted = false;
  if (finalVerdict === "pass") {
    authorCompleted = await completeAuthorChallenge(db, task.acquisition_submissions);
  }
  await db.from("acquisition_submissions").update({ status: finalVerdict === "pass" ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", task.source_submission_id);

  return { taskStatus: "settled", reward: reviewerReward, authorCompleted };
}

async function operatorFinalize(db: any, taskId: string, verdict: "pass" | "fail"): Promise<any> {
  const { data: task } = await db.from("peer_review_tasks")
    .select("id,status,due_at,required_reviews,source_submission_id,acquisition_submissions!inner(id,user_id,challenge_id,status)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { error: "Task not found." };
  if (task.status === "settled") return { taskStatus: "settled", operatorVerdict: verdict, authorCompleted: false, reward: 0 };
  if (new Date(task.due_at ?? 0).getTime() > Date.now()) return { error: "Operator fallback is available after the due time." };
  const { data: settledTask, error: updateError } = await db.from("peer_review_tasks")
    .update({ status: "settled", final_verdict: verdict, finalised_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .in("status", ["open", "in_review"])
    .select("id")
    .maybeSingle();
  if (updateError || !settledTask) return { error: updateError?.message ?? "Task was settled by another request." };

  const { data: answers } = await db.from("peer_review_answers").select("id").eq("task_id", taskId).eq("status", "submitted");
  let reward = 0;
  for (const answer of answers ?? []) {
    const { data: rewardData } = await db.rpc("settle_peer_review_answer", { p_answer_id: answer.id, p_quality_status: "valid", p_reason: "Operator finalization" });
    reward += Number(rewardData?.[0]?.reward_amount ?? 0);
  }
  const submission = task.acquisition_submissions;
  let authorCompleted = false;
  if (verdict === "pass") authorCompleted = await completeAuthorChallenge(db, submission);
  await db.from("acquisition_submissions").update({ status: verdict === "pass" ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", task.source_submission_id);
  return { taskStatus: "settled", operatorVerdict: verdict, authorCompleted, reward };
}

async function completeAuthorChallenge(db: any, submission: any): Promise<boolean> {
  const { data: challenge } = await db.from("challenges").select("id,reward_amount,reward_account,reward_label").eq("id", submission.challenge_id).maybeSingle();
  const rewardAmount = Number(challenge?.reward_amount ?? parseRewardAmount(challenge?.reward_label));
  const rewardAccount = challenge?.reward_account ?? "core";
  const { data, error } = await db.rpc("complete_user_challenge", {
    p_user_id: submission.user_id,
    p_challenge_id: submission.challenge_id,
    p_reward_account: rewardAccount,
    p_reward_amount: rewardAmount
  });
  if (error) return false;
  const result = data?.[0];
  if (result?.reward_claimed) {
    await recordProductEvent({ entityId: submission.challenge_id, entityType: "challenge", eventName: "challenge_completed", properties: { reward_account: rewardAccount, reward_amount: rewardAmount, via: "peer_review" }, source: "server", userId: submission.user_id });
  }
  return Boolean(result?.reward_claimed);
}

async function reopenTaskIfNeeded(db: any, taskId: string) {
  const { data: active } = await db.from("peer_review_answers").select("id").eq("task_id", taskId).in("status", ["accepted", "submitted"]).limit(1);
  if (!active?.length) await db.from("peer_review_tasks").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", taskId).in("status", ["in_review", "open"]);
}

function normalizeCurrent(answer: any) {
  const task = answer.peer_review_tasks;
  const source = task?.acquisition_submissions;
  return { answer: { id: answer.id, status: answer.status, verdict: answer.verdict, checklist: answer.checklist, notes: answer.notes }, task: { ...task, acquisition_submissions: source } };
}

function validateChecklist(checklist: Record<string, boolean> | undefined): string | null {
  if (!checklist) return "Complete the checklist.";
  for (const key of CHECKLIST_KEYS) {
    if (typeof checklist[key] !== "boolean") return "Complete every checklist item.";
  }
  return null;
}

async function getProgress(db: any, userId: string) {
  const { data } = await db.from("user_challenges").select("status,verification_data").eq("user_id", userId).eq("challenge_id", PEER_REVIEWS_CHALLENGE_ID).maybeSingle();
  const verificationData = data?.verification_data ?? {};
  return {
    accepted: data?.status === "accepted",
    score: Number(verificationData.review_score ?? 0),
    reviewsCompleted: Number(verificationData.reviews_completed ?? 0),
    validReviews: Number(verificationData.valid_reviews ?? 0),
    invalidReviews: Number(verificationData.invalid_reviews ?? 0),
    nextRewardBlocked: Boolean(verificationData.next_reward_blocked),
    lastRewardAt: verificationData.last_reward_at ?? null
  };
}

function parseRewardAmount(value: unknown): number {
  const text = typeof value === "string" ? value : value && typeof value === "object" && !Array.isArray(value) ? String((value as any).en ?? (value as any).ru ?? "") : String(value ?? "");
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*\$|\+(\d+(?:[.,]\d+)?)/);
  return Number(String(match?.[1] ?? match?.[2] ?? 1).replace(",", "."));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}