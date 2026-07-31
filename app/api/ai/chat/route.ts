import { NextRequest, NextResponse } from "next/server";
import { buildAiSystemPrompt } from "@/lib/ai/knowledge";
import {
  AiGatewayError,
  streamAiText,
  type AiConversationMessage,
} from "@/lib/ai/providerGateway";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { AppLocale } from "@/lib/i18n";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type ChatRequest = {
  messages?: unknown;
  locale?: string;
};

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 6_000;
const MAX_TOTAL_LENGTH = 30_000;

/**
 * POST /api/ai/chat
 *
 * Streams the Home | Ideas AI response through the shared provider gateway.
 * Every provider receives the same versioned system knowledge and capability
 * policy separately from the user conversation.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  if (!body) {
    return errorResponse("Invalid JSON body.", 400);
  }

  const messages = normalizeMessages(body.messages);
  if (!messages) {
    return errorResponse("A valid messages array ending with a user message is required.", 400);
  }

  const locale: AppLocale = body.locale === "ru" ? "ru" : "en";
  const systemPrompt = buildAiSystemPrompt({ locale, capability: "chat.general" });

  try {
    return await streamAiText({ systemPrompt, messages });
  } catch (error) {
    if (error instanceof AiGatewayError && error.code === "not_configured") {
      return errorResponse("AI providers not configured. Set GEMINI_API_KEY or GROQ_API_KEY in .env", 503);
    }

    return errorResponse("All AI providers failed. Please try again.", 502);
  }
}

function normalizeMessages(value: unknown): AiConversationMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;

  let totalLength = 0;
  const messages: AiConversationMessage[] = [];

  for (const item of value) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) return null;
    if (typeof item.content !== "string") return null;

    const content = item.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;

    totalLength += content.length;
    if (totalLength > MAX_TOTAL_LENGTH) return null;
    messages.push({ role: item.role, content });
  }

  return messages[messages.length - 1]?.role === "user" ? messages : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}
