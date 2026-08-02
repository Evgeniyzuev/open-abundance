import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  SOFTWARE_CREATION_SLUG,
  localizedList,
  localizedText,
  type SkillEvidence,
  type SkillPassportPayload,
  type SkillReviewDecision,
  type SkillReviewRequest,
  type SkillSubmission
} from "@/lib/skills";
import { asSkillDbClient, isBootstrapReviewer, isMissingSkillSchemaError } from "@/lib/skillsServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Locale = "ru" | "en";

export async function GET(request: NextRequest) {
  const { supabase, user, error: authError } = await getAuthenticatedUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to open Skill Passport." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const locale: Locale = request.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "en";
  const db = asSkillDbClient(supabase);

  try {
    const [skillsResult, rulesResult, userSkillsResult, submissionsResult, profileResult, openRequestsResult, assignedRequestsResult] = await Promise.all([
      db.from("skills").select("id,slug,title,description,learning_path,is_active").eq("is_active", true).order("slug"),
      db.from("skill_level_rules").select("id,skill_id,level,requirements,rubric").eq("level", 1),
      db.from("user_skills").select("user_id,skill_id,earned_skill_level,effective_skill_level,status").eq("user_id", user.id),
      db.from("skill_submissions").select("id,user_id,skill_id,target_level,status,attempt,latest_evidence_version,rework_reason,submitted_at,accepted_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
      db.from("user_profiles").select("level").eq("user_id", user.id).maybeSingle(),
      db.from("skill_review_requests").select("id,submission_id,evidence_id,slot_no,reviewer_user_id,status,claimed_at,decided_at,created_at").eq("status", "open").order("created_at", { ascending: true }).limit(60),
      db.from("skill_review_requests").select("id,submission_id,evidence_id,slot_no,reviewer_user_id,status,claimed_at,decided_at,created_at").eq("reviewer_user_id", user.id).eq("status", "assigned").order("created_at", { ascending: false }).limit(30)
    ]);

    const firstError = [skillsResult, rulesResult, userSkillsResult, submissionsResult, profileResult, openRequestsResult, assignedRequestsResult]
      .map((result) => result.error)
      .find(Boolean);
    if (firstError) {
      return NextResponse.json(
        { error: isMissingSkillSchemaError(firstError) ? "Skill Passport is waiting for its database migration." : firstError.message },
        { status: isMissingSkillSchemaError(firstError) ? 503 : 500, headers: NO_STORE_HEADERS }
      );
    }

    const skillRows = skillsResult.data ?? [];
    const ruleBySkillId = new Map((rulesResult.data ?? []).map((rule: any) => [rule.skill_id, rule]));
    const userSkillBySkillId = new Map((userSkillsResult.data ?? []).map((skill: any) => [skill.skill_id, skill]));
    const submissions = submissionsResult.data ?? [];
    const submissionIds = submissions.map((submission: any) => submission.id);
    const [evidenceResult, ownRequestsResult] = submissionIds.length
      ? await Promise.all([
          db.from("skill_evidence").select("id,submission_id,version,deliverable_title,deliverable_description,acceptance_criteria,repo_url,proof_url,test_scenario,limitations,content_hash,created_at").in("submission_id", submissionIds).order("version", { ascending: false }),
          db.from("skill_review_requests").select("id,submission_id,evidence_id,slot_no,reviewer_user_id,status,claimed_at,decided_at,created_at").in("submission_id", submissionIds).order("slot_no", { ascending: true })
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (evidenceResult.error || ownRequestsResult.error) {
      const queryError = evidenceResult.error ?? ownRequestsResult.error;
      return NextResponse.json({ error: queryError?.message ?? "Could not load skill evidence." }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const ownRequestRows = ownRequestsResult.data ?? [];
    const requestIds = ownRequestRows.map((row: any) => row.id);
    const decisionResult = requestIds.length
      ? await db.from("skill_review_decisions").select("id,request_id,evidence_id,reviewer_user_id,verdict,reproducibility,criteria_met,proof_sufficient,safety,critical_issue,recommendation,comment,created_at").in("request_id", requestIds)
      : { data: [], error: null };
    if (decisionResult.error) {
      return NextResponse.json({ error: decisionResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const evidenceBySubmission = latestEvidenceBySubmission(evidenceResult.data ?? []);
    const decisionsByRequest = new Map((decisionResult.data ?? []).map((decision: any) => [decision.request_id, toDecision(decision)]));
    const requestsBySubmission = new Map<string, any[]>();
    ownRequestRows.forEach((requestRow: any) => {
      const current = requestsBySubmission.get(requestRow.submission_id) ?? [];
      current.push(requestRow);
      requestsBySubmission.set(requestRow.submission_id, current);
    });

    const submissionBySkillId = new Map<string, SkillSubmission>();
    for (const submission of submissions as any[]) {
      const evidence = evidenceBySubmission.get(submission.id) ?? null;
      const reviewRequests = (requestsBySubmission.get(submission.id) ?? [])
        .filter((requestRow) => requestRow.evidence_id === evidence?.id)
        .map((requestRow) => toReviewRequest(requestRow, evidence, decisionsByRequest.get(requestRow.id) ?? null));
      submissionBySkillId.set(submission.skill_id, {
        id: submission.id,
        targetLevel: submission.target_level,
        status: submission.status,
        attempt: submission.attempt,
        latestEvidenceVersion: submission.latest_evidence_version,
        reworkReason: submission.rework_reason,
        submittedAt: submission.submitted_at,
        acceptedAt: submission.accepted_at,
        evidence,
        reviewRequests
      });
    }

    const openAndAssignedRows = [...(openRequestsResult.data ?? []), ...(assignedRequestsResult.data ?? [])];
    const queueSubmissionIds = Array.from(new Set(openAndAssignedRows.map((row: any) => row.submission_id)));
    const queueUserIds = Array.from(new Set(openAndAssignedRows.map((row: any) => row.reviewer_user_id).filter(Boolean)));
    const queueEvidenceIds = Array.from(new Set(openAndAssignedRows.map((row: any) => row.evidence_id)));
    const [queueSubmissionsResult, queueEvidenceResult, queueDecisionResult, queueProfilesResult] = await Promise.all([
      queueSubmissionIds.length ? db.from("skill_submissions").select("id,user_id,skill_id,target_level,status").in("id", queueSubmissionIds) : { data: [], error: null },
      queueEvidenceIds.length ? db.from("skill_evidence").select("id,submission_id,version,deliverable_title,deliverable_description,acceptance_criteria,repo_url,proof_url,test_scenario,limitations,content_hash,created_at").in("id", queueEvidenceIds) : { data: [], error: null },
      openAndAssignedRows.length ? db.from("skill_review_decisions").select("id,request_id,evidence_id,reviewer_user_id,verdict,reproducibility,criteria_met,proof_sufficient,safety,critical_issue,recommendation,comment,created_at").in("request_id", openAndAssignedRows.map((row: any) => row.id)) : { data: [], error: null },
      queueUserIds.length ? db.from("user_profiles").select("user_id,display_name,username").in("user_id", queueUserIds) : { data: [], error: null }
    ]);
    const queueError = [queueSubmissionsResult, queueEvidenceResult, queueDecisionResult, queueProfilesResult].map((result) => result.error).find(Boolean);
    if (queueError) return NextResponse.json({ error: queueError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const queueSubmissionById = new Map((queueSubmissionsResult.data ?? []).map((submission: any) => [submission.id, submission]));
    const queueEvidenceById = new Map((queueEvidenceResult.data ?? []).map((evidence: any) => [evidence.id, toEvidence(evidence)]));
    const queueDecisionByRequest = new Map((queueDecisionResult.data ?? []).map((decision: any) => [decision.request_id, toDecision(decision)]));
    const queueProfileById = new Map((queueProfilesResult.data ?? []).map((profile: any) => [profile.user_id, profile]));
    const eligibleSkillIds = new Set(
      (userSkillsResult.data ?? [])
        .filter((skill: any) => skill.status === "verified" && Number(skill.earned_skill_level) >= 1)
        .map((skill: any) => skill.skill_id)
    );
    const bootstrap = isBootstrapReviewer(user.id);
    const skillById = new Map(skillRows.map((skill: any) => [skill.id, skill]));
    const reviewQueue: SkillReviewRequest[] = [];
    for (const requestRow of openAndAssignedRows as any[]) {
      const queueSubmission = queueSubmissionById.get(requestRow.submission_id);
      if (!queueSubmission) continue;
      const canClaim = requestRow.status === "open" && (bootstrap || eligibleSkillIds.has(queueSubmission.skill_id));
      if (requestRow.status === "open" && !canClaim) continue;
      const ownerProfile = queueSubmission.user_id ? queueProfileById.get(queueSubmission.user_id) : null;
      const skill = skillById.get(queueSubmission.skill_id);
      reviewQueue.push({
        ...toReviewRequest(requestRow, queueEvidenceById.get(requestRow.evidence_id) ?? null, queueDecisionByRequest.get(requestRow.id) ?? null),
        ownerName: ownerProfile?.display_name ?? (ownerProfile?.username ? `@${ownerProfile.username}` : "Open Abundance participant"),
        skillTitle: localizedText(skill?.title, locale),
        targetLevel: queueSubmission.target_level,
        canClaim
      });
    }

    const payload: SkillPassportPayload = {
      coreLevel: Number(profileResult.data?.level ?? 0),
      skills: skillRows.map((skill: any) => {
        const userSkill = userSkillBySkillId.get(skill.id);
        const rule = ruleBySkillId.get(skill.id);
        return {
          id: skill.id,
          slug: skill.slug,
          title: localizedText(skill.title, locale),
          description: localizedText(skill.description, locale),
          learningPath: localizedList(skill.learning_path, locale),
          available: skill.slug === SOFTWARE_CREATION_SLUG,
          earnedLevel: Number(userSkill?.earned_skill_level ?? 0),
          effectiveLevel: Math.min(Number(userSkill?.earned_skill_level ?? 0), Number(profileResult.data?.level ?? 0)),
          status: userSkill?.status === "verified" ? "verified" : "unverified",
          rule: rule ? {
            level: Number(rule.level),
            requirements: localizedText(rule.requirements, locale),
            rubric: Array.isArray(rule.rubric)
              ? rule.rubric.map((item: any) => ({ key: String(item.key ?? "rubric"), label: localizedText(item, locale) })).filter((item: { key: string; label: string }) => item.label)
              : []
          } : null,
          submission: submissionBySkillId.get(skill.id) ?? null
        };
      }),
      reviewQueue,
      reviewerBootstrapEnabled: bootstrap
    };

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : "Could not load Skill Passport." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function latestEvidenceBySubmission(rows: any[]): Map<string, SkillEvidence> {
  const result = new Map<string, SkillEvidence>();
  for (const row of rows) {
    const current = result.get(row.submission_id);
    if (!current || row.version > current.version) result.set(row.submission_id, toEvidence(row));
  }
  return result;
}

function toEvidence(row: any): SkillEvidence {
  return {
    id: row.id,
    version: Number(row.version),
    deliverableTitle: row.deliverable_title,
    deliverableDescription: row.deliverable_description,
    acceptanceCriteria: row.acceptance_criteria,
    repoUrl: row.repo_url,
    proofUrl: row.proof_url,
    testScenario: row.test_scenario,
    limitations: row.limitations,
    contentHash: row.content_hash,
    createdAt: row.created_at
  };
}

function toDecision(row: any): SkillReviewDecision {
  return {
    id: row.id,
    requestId: row.request_id,
    reviewerUserId: row.reviewer_user_id,
    verdict: row.verdict,
    reproducibility: Boolean(row.reproducibility),
    criteriaMet: Boolean(row.criteria_met),
    proofSufficient: Boolean(row.proof_sufficient),
    safety: Boolean(row.safety),
    criticalIssue: Boolean(row.critical_issue),
    recommendation: row.recommendation,
    comment: row.comment,
    createdAt: row.created_at
  };
}

function toReviewRequest(row: any, evidence: SkillEvidence | null, decision: SkillReviewDecision | null): SkillReviewRequest {
  return {
    id: row.id,
    slotNo: Number(row.slot_no),
    status: row.status,
    reviewerUserId: row.reviewer_user_id,
    claimedAt: row.claimed_at,
    decidedAt: row.decided_at,
    evidence,
    decision
  };
}

