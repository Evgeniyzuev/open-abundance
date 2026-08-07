import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import {
  ACQUISITION_REVIEW_DUE_HOURS,
  isAcquisitionMetricLogic,
  isAllowedAcquisitionPlatform,
  metricKeyFromLogic,
  normalizeAcquisitionUrl,
  platformForHost
} from "@/lib/acquisitionChallenges";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type AcquisitionBody = {
  action?: "prepare" | "submit";
  challengeId?: string;
  submissionType?: "publication" | "metric";
  canonicalUrl?: string;
  platform?: string;
  title?: string;
  bodyExcerpt?: string;
  coverUrl?: string;
  referralUrl?: string;
  publicationSubmissionId?: string;
  metricValue?: number;
  metricEvidenceUrl?: string;
};

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const db = supabase as any;
  const { data: submissions, error: submissionError } = await db
    .from("acquisition_submissions")
    .select("id,challenge_id,submission_type,canonical_url,platform,title,cover_url,metric_key,metric_value,metric_evidence_url,status,review_round,created_at,reviewed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ submissions: submissions ?? [] }, { headers: NO_STORE_HEADERS });
}
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => ({}))) as AcquisitionBody;
  if (!body.challengeId || !isUuid(body.challengeId)) return NextResponse.json({ error: "Invalid challenge." }, { status: 400, headers: NO_STORE_HEADERS });

  const db = supabase as any;
  const { data: challenge, error: challengeError } = await db
    .from("challenges")
    .select("id,title,verification_logic,acquisition_target,acquisition_metric_key,reward_amount,reward_account")
    .eq("id", body.challengeId)
    .eq("is_active", true)
    .maybeSingle();

  if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404, headers: NO_STORE_HEADERS });

  if (!body.action || body.action === "prepare") {
    if (challenge.verification_logic !== "acquisition_publications_milestone") {
      return NextResponse.json({ error: "A tracked publication link is only used for publication challenges." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const code = await getOrCreateReferralCode(db, user.id);
    const link = new URL(request.nextUrl.origin);
    link.searchParams.set("ref", code);
    link.searchParams.set("utm_medium", "acquisition_challenge");
    link.searchParams.set("utm_campaign", body.challengeId);
    return NextResponse.json({
      referralCode: code,
      trackedUrl: link.toString(),
      platforms: ["VC.ru", "Habr", "Пикабу", "Reddit", "Product Radar", "Telegraph", "публичный Telegram", "YouTube/TikTok/Instagram", "личный публичный блог"]
    }, { headers: NO_STORE_HEADERS });
  }

  const { data: progress, error: progressError } = await db.from("user_challenges").select("status").eq("user_id", user.id).eq("challenge_id", body.challengeId).maybeSingle();
  if (progressError) return NextResponse.json({ error: progressError.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (!progress || progress.status !== "accepted") return NextResponse.json({ error: progress?.status === "completed" ? "This challenge is already completed." : "Accept this challenge before submitting evidence." }, { status: 409, headers: NO_STORE_HEADERS });

  if (body.submissionType !== "publication" && body.submissionType !== "metric") {
    return NextResponse.json({ error: "Choose a submission type." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const isPublication = body.submissionType === "publication";
  if (isPublication && challenge.verification_logic !== "acquisition_publications_milestone") {
    return NextResponse.json({ error: "This challenge accepts a quality metric submission." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!isPublication && !isAcquisitionMetricLogic(challenge.verification_logic)) {
    return NextResponse.json({ error: "This challenge accepts a publication submission." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const canonical = normalizeAcquisitionUrl(body.canonicalUrl ?? "");
  if ("error" in canonical) return NextResponse.json({ error: canonical.error }, { status: 400, headers: NO_STORE_HEADERS });
  const cover = normalizeAcquisitionUrl(body.coverUrl ?? "");
  if (isPublication && "error" in cover) return NextResponse.json({ error: "Add a public image or video cover URL." }, { status: 400, headers: NO_STORE_HEADERS });
  if (isPublication && (!body.title?.trim() || !body.bodyExcerpt?.trim())) return NextResponse.json({ error: "Add a title and a short personal context." }, { status: 400, headers: NO_STORE_HEADERS });

  const platform = body.platform?.trim() || platformForHost(canonical.host);
  if (!isAllowedAcquisitionPlatform(canonical.host, platform)) {
    return NextResponse.json({ error: "The selected platform does not match the submitted URL." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data: referralCode, error: referralError } = await db.from("referral_codes").select("code").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (referralError) return NextResponse.json({ error: referralError.message }, { status: 500, headers: NO_STORE_HEADERS });

  if (isPublication) {
    const referralValue = body.referralUrl?.trim() ?? "";
    if (!referralCode?.code || !hasReferralCode(referralValue, referralCode.code)) {
      return NextResponse.json({ error: "Use your own tracked referral link in the publication." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db.from("acquisition_submissions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("submission_type", "publication").gte("created_at", since).in("status", ["pending_review", "approved"]);
    if (Number(count ?? 0) >= 1) return NextResponse.json({ error: "Submit at most one accepted publication every 24 hours." }, { status: 409, headers: NO_STORE_HEADERS });
  } else {
    if (!body.publicationSubmissionId || !isUuid(body.publicationSubmissionId)) return NextResponse.json({ error: "Select an approved publication first." }, { status: 400, headers: NO_STORE_HEADERS });
    const { data: publication } = await db.from("acquisition_submissions").select("id").eq("id", body.publicationSubmissionId).eq("user_id", user.id).eq("submission_type", "publication").eq("status", "approved").maybeSingle();
    if (!publication) return NextResponse.json({ error: "Only your approved publication can receive a quality metric." }, { status: 400, headers: NO_STORE_HEADERS });
    const metricKey = metricKeyFromLogic(challenge.verification_logic);
    const metricValue = Number(body.metricValue);
    const target = Number(challenge.acquisition_target ?? 0);
    if (!metricKey || !Number.isFinite(metricValue) || metricValue < target) return NextResponse.json({ error: "Metric must be at least " + target + "." }, { status: 400, headers: NO_STORE_HEADERS });
    const evidence = normalizeAcquisitionUrl(body.metricEvidenceUrl ?? "");
    if ("error" in evidence) return NextResponse.json({ error: "Add a public metric evidence URL." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const metricKey = !isPublication ? metricKeyFromLogic(challenge.verification_logic) : null;
  const evidence = !isPublication ? normalizeAcquisitionUrl(body.metricEvidenceUrl ?? "") : null;
  const coverValue = isPublication && "url" in cover ? cover.url : null;
  const { data: submission, error: insertError } = await db.from("acquisition_submissions").insert({
    user_id: user.id,
    challenge_id: body.challengeId,
    submission_type: body.submissionType,
    canonical_url: isPublication ? canonical.url : null,
    platform,
    title: body.title?.trim() || null,
    body_excerpt: body.bodyExcerpt?.trim() || null,
    cover_url: coverValue,
    referral_url: isPublication ? body.referralUrl?.trim() : null,
    publication_submission_id: isPublication ? null : body.publicationSubmissionId,
    metric_key: metricKey,
    metric_value: !isPublication ? Number(body.metricValue) : null,
    metric_evidence_url: evidence && "url" in evidence ? evidence.url : null,
    status: "pending_review",
    review_round: 1,
  }).select("id").single();

  if (insertError || !submission) return NextResponse.json({ error: insertError?.message ?? "Could not save submission." }, { status: 500, headers: NO_STORE_HEADERS });

  const dueAt = new Date(Date.now() + ACQUISITION_REVIEW_DUE_HOURS * 60 * 60 * 1000).toISOString();
  const { data: task, error: taskError } = await db.from("peer_review_tasks").insert({
    source_submission_id: submission.id,
    status: "open",
    required_reviews: 3,
    pass_threshold: 2,
    due_at: dueAt
  }).select("id").single();

  if (taskError || !task) {
    await db.from("acquisition_submissions").update({ status: "cancelled" }).eq("id", submission.id);
    return NextResponse.json({ error: taskError?.message ?? "Could not create review task." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  await recordProductEvent({
    entityId: submission.id,
    entityType: "acquisition_submission",
    eventName: "acquisition_submission_created",
    properties: { challenge_id: body.challengeId, submission_type: body.submissionType, platform, review_task_id: task.id },
    source: "server",
    userId: user.id
  });

  return NextResponse.json({ submissionId: submission.id, reviewTaskId: task.id, status: "pending_review" }, { headers: NO_STORE_HEADERS });
}
async function getOrCreateReferralCode(db: any, userId: string): Promise<string> {
  const { data: existing, error } = await db.from("referral_codes").select("code").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomBytes(6).toString("base64url");
    const { error: insertError } = await db.from("referral_codes").insert({ code, user_id: userId });
    if (!insertError) return code;
    if (insertError.code !== "23505") throw new Error(insertError.message);
  }
  throw new Error("Could not create a referral code.");
}

function hasReferralCode(value: string, code: string): boolean {
  try {
    return new URL(value).searchParams.get("ref") === code;
  } catch {
    return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}