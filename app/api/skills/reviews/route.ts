import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { asSkillDbClient, isBootstrapReviewer, isUuid, trimText } from "@/lib/skillsServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ReviewBody = {
  action?: "claim" | "decide";
  requestId?: string;
  verdict?: "pass" | "rework";
  reproducibility?: boolean;
  criteriaMet?: boolean;
  proofSufficient?: boolean;
  safety?: boolean;
  criticalIssue?: boolean;
  recommendation?: string;
  comment?: string;
};

export async function POST(request: NextRequest) {
  const { supabase, user, error: authError } = await getAuthenticatedUser(request);
  if (authError || !user) return NextResponse.json({ error: "Sign in to review skill evidence." }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => ({}))) as ReviewBody;
  if (!isUuid(body.requestId)) return NextResponse.json({ error: "Invalid review request." }, { status: 400, headers: NO_STORE_HEADERS });
  const db = asSkillDbClient(supabase);

  try {
    if (body.action === "claim") {
      const { data, error } = await db.rpc("claim_skill_review_request", {
        p_request_id: body.requestId,
        p_reviewer_user_id: user.id,
        p_bootstrap: isBootstrapReviewer(user.id)
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ result: data }, { headers: NO_STORE_HEADERS });
    }

    if (body.action !== "decide" || (body.verdict !== "pass" && body.verdict !== "rework")) {
      return NextResponse.json({ error: "Choose a review action and verdict." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const recommendation = trimText(body.recommendation, 2000);
    const comment = trimText(body.comment, 3000);
    if (recommendation.length < 3 || comment.length < 3) {
      return NextResponse.json({ error: "Add a short recommendation and review comment." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const booleanFields = [body.reproducibility, body.criteriaMet, body.proofSufficient, body.safety, body.criticalIssue];
    if (booleanFields.some((value) => typeof value !== "boolean")) {
      return NextResponse.json({ error: "Complete every structured review criterion." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (body.verdict === "pass" && body.criticalIssue) {
      return NextResponse.json({ error: "A passing verdict cannot contain an unresolved critical issue." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error } = await db.rpc("record_skill_review_decision", {
      p_request_id: body.requestId,
      p_reviewer_user_id: user.id,
      p_verdict: body.verdict,
      p_reproducibility: body.reproducibility,
      p_criteria_met: body.criteriaMet,
      p_proof_sufficient: body.proofSufficient,
      p_safety: body.safety,
      p_critical_issue: body.criticalIssue,
      p_recommendation: recommendation,
      p_comment: comment
    });
    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ result: data }, { headers: NO_STORE_HEADERS });
  } catch (reviewError) {
    return NextResponse.json({ error: reviewError instanceof Error ? reviewError.message : "Could not save the review." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  const status = error.code === "22023" ? 400 : error.code === "42501" ? 403 : error.code === "55000" ? 409 : error.code === "P0002" ? 404 : 500;
  return NextResponse.json({ error: error.message ?? "Could not save the review." }, { status, headers: NO_STORE_HEADERS });
}

