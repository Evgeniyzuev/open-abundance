import { NextRequest, NextResponse } from "next/server";
import { buildAiSystemPrompt } from "@/lib/ai/knowledge";
import { generateAiJson } from "@/lib/ai/providerGateway";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type SuggestionsRequest = { locale?: string; answer?: string; previousUserMessage?: string };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SuggestionsRequest | null;
  if (!body?.answer?.trim()) return NextResponse.json({ error: "A completed answer is required." }, { status: 400, headers: NO_STORE_HEADERS });

  const { user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  try {
    const locale = body.locale === "ru" ? "ru" : "en";
    const result = await generateAiJson<{ suggestions?: unknown }>({
      systemPrompt: `${buildAiSystemPrompt({ locale, capability: "chat.general" })}\n\nFor this task generate three to five concise follow-up questions grounded in the completed answer. Return JSON only: {"suggestions":["..."]}.`,
      userPrompt: JSON.stringify({ answer: body.answer.slice(0, 6000), previousUserMessage: body.previousUserMessage?.slice(0, 2000) ?? "" }),
      validate: (value: unknown) => (value && typeof value === "object" ? value as { suggestions?: unknown } : {})
    });
    const suggestions = Array.isArray(result.value.suggestions)
      ? result.value.suggestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 5)
      : [];
    return NextResponse.json({ suggestions }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ suggestions: [] }, { headers: NO_STORE_HEADERS });
  }
}
