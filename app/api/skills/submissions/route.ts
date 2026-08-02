import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { SOFTWARE_CREATION_SLUG } from "@/lib/skills";
import { asSkillDbClient, isHttpUrl } from "@/lib/skillsServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type SubmissionBody = {
  skillSlug?: string;
  deliverableTitle?: string;
  deliverableDescription?: string;
  acceptanceCriteria?: string;
  repoUrl?: string;
  proofUrl?: string;
  testScenario?: string;
  limitations?: string;
  submit?: boolean;
};

export async function POST(request: NextRequest) {
  const { supabase, user, error: authError } = await getAuthenticatedUser(request);
  if (authError || !user) return NextResponse.json({ error: "Sign in to submit skill evidence." }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => ({}))) as SubmissionBody;
  if (body.skillSlug !== SOFTWARE_CREATION_SLUG) return NextResponse.json({ error: "This skill challenge is not available." }, { status: 400, headers: NO_STORE_HEADERS });

  const fields: Record<string, [unknown, number]> = {
    deliverableTitle: [body.deliverableTitle, 160],
    deliverableDescription: [body.deliverableDescription, 4000],
    acceptanceCriteria: [body.acceptanceCriteria, 2000],
    repoUrl: [body.repoUrl, 2048],
    proofUrl: [body.proofUrl, 2048],
    testScenario: [body.testScenario, 3000],
    limitations: [body.limitations, 2000]
  };
  const normalized = Object.fromEntries(Object.entries(fields).map(([key, [value]]) => [key, typeof value === "string" ? value.trim() : ""]));
  const minimums: Record<string, number> = {
    deliverableTitle: 3,
    deliverableDescription: 10,
    acceptanceCriteria: 3,
    repoUrl: 8,
    proofUrl: 8,
    testScenario: 10,
    limitations: 3
  };
  for (const [key, minimum] of Object.entries(minimums)) {
    const value = normalized[key] as string;
    const maxLength = fields[key][1];
    if (value.length < minimum || value.length > maxLength) {
      return NextResponse.json({ error: `Field ${key} must be between ${minimum} and ${maxLength} characters.` }, { status: 400, headers: NO_STORE_HEADERS });
    }
  }
  if (!isHttpUrl(normalized.repoUrl) || !isHttpUrl(normalized.proofUrl)) {
    return NextResponse.json({ error: "Repository and proof must be valid HTTP or HTTPS links." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const db = asSkillDbClient(supabase);
    const { data, error } = await db.rpc("submit_skill_evidence", {
      p_user_id: user.id,
      p_skill_slug: SOFTWARE_CREATION_SLUG,
      p_deliverable_title: normalized.deliverableTitle,
      p_deliverable_description: normalized.deliverableDescription,
      p_acceptance_criteria: normalized.acceptanceCriteria,
      p_repo_url: normalized.repoUrl,
      p_proof_url: normalized.proofUrl,
      p_test_scenario: normalized.testScenario,
      p_limitations: normalized.limitations,
      p_submit: body.submit === true
    });
    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ result: data }, { headers: NO_STORE_HEADERS });
  } catch (submissionError) {
    return NextResponse.json({ error: submissionError instanceof Error ? submissionError.message : "Could not save the submission." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  const status = error.code === "22023" ? 400 : error.code === "42501" ? 403 : error.code === "55000" ? 409 : 500;
  return NextResponse.json({ error: error.message ?? "Could not save the submission." }, { status, headers: NO_STORE_HEADERS });
}

