import { NextRequest, NextResponse } from "next/server";
import { buildAiSystemPrompt } from "@/lib/ai/knowledge";
import { AiGatewayError, generateAiJson } from "@/lib/ai/providerGateway";
import { buildSafetyPayload, hasSafetyText } from "@/lib/ai/safety";
import { guardAiTool } from "@/lib/ai/toolGuard";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { buildProjectReviewPrompt, normalizeProjectAnswers, normalizeProjectReview, type ProjectReview } from "@/lib/projectReview";

export const dynamic = "force-dynamic";

/** POST { answers, locale } -> Nova's review of the person's project (3 a day, 20 a month). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { answers?: unknown; locale?: unknown } | null;
  const locale = body?.locale === "ru" ? "ru" : "en";
  const answers = normalizeProjectAnswers(body?.answers);
  if (!answers) return NextResponse.json({ error: "Describe the project in a few words." }, { status: 400, headers: NO_STORE_HEADERS });
  if (hasSafetyText(`${answers.idea}\n${answers.audience}\n${answers.blocker}`)) {
    return NextResponse.json(buildSafetyPayload(locale), { headers: NO_STORE_HEADERS });
  }

  const guard = await guardAiTool(request, "tools.project");
  if (!guard.ok) return guard.response;

  try {
    const result = await generateAiJson<ProjectReview>({
      systemPrompt: buildAiSystemPrompt({ locale, capability: "project.review" }),
      userPrompt: buildProjectReviewPrompt(answers, locale),
      maxOutputTokens: 900,
      validate: (value) => {
        const review = normalizeProjectReview(value);
        if (!review) throw new Error("No usable review.");
        return review;
      }
    });
    await recordProductEvent({ eventName: "project_review_done", userId: guard.userId, properties: { stage: answers.stage, hours: answers.hours } }).catch(() => undefined);
    return NextResponse.json({ review: result.value }, { headers: { ...NO_STORE_HEADERS, "X-AI-Provider": result.provider } });
  } catch (error) {
    await guard.refund();
    if (error instanceof AiGatewayError && error.code === "not_configured") {
      return NextResponse.json({ error: "AI providers are not configured." }, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: "AI response could not be validated." }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
