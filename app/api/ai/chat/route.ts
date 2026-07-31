import { NextRequest, NextResponse } from "next/server";
import { AI_KNOWLEDGE_VERSION, buildAiSystemPrompt } from "@/lib/ai/knowledge";
import {
  AI_PROVIDER_MODELS,
  AiGatewayError,
  streamAiText,
  type AiConversationMessage,
  type AiProvider
} from "@/lib/ai/providerGateway";
import {
  acquireAiRequest,
  AiQuotaServiceError,
  estimateAiTokens,
  recordAiUsageEvent,
  releaseAiRequest,
  reserveAiChatMessage
} from "@/lib/ai/serverUsage";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { AppLocale } from "@/lib/i18n";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

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
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  let auth: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    auth = await getAuthenticatedUser(request);
  } catch {
    return errorResponse("AI authentication is unavailable.", 503, { code: "ai_auth_unavailable" });
  }

  if (!auth.user) {
    return errorResponse("Authentication is required for AI chat.", 401, { code: "ai_auth_required" });
  }

  let requestAcquired = false;

  try {
    const guard = await acquireAiRequest(auth.user.id);
    if (!guard.allowed) {
      await recordAiUsageEvent({
        requestId,
        userId: auth.user.id,
        capability: "chat.general",
        status: guard.reason === "concurrency" ? "concurrency_blocked" : "rate_limited",
        inputTokens: estimateChatInputTokens(systemPrompt, messages),
        latencyMs: Date.now() - startedAt,
        policyVersion: AI_KNOWLEDGE_VERSION
      });
      return errorResponse(
        guard.reason === "concurrency" ? "A previous AI response is still in progress." : "AI request rate limit reached.",
        guard.reason === "concurrency" ? 409 : 429,
        {
          code: guard.reason === "concurrency" ? "ai_request_in_progress" : "ai_rate_limited",
          retryAfterSeconds: guard.retryAfterSeconds
        }
      );
    }
    requestAcquired = true;

    const quota = await reserveAiChatMessage(auth.user.id);
    if (!quota.allowed) {
      await releaseAiRequest(auth.user.id);
      requestAcquired = false;
      await recordAiUsageEvent({
        requestId,
        userId: auth.user.id,
        capability: "chat.general",
        status: "quota_blocked",
        inputTokens: estimateChatInputTokens(systemPrompt, messages),
        latencyMs: Date.now() - startedAt,
        policyVersion: AI_KNOWLEDGE_VERSION
      });
      return errorResponse("AI message quota exhausted.", 429, { code: "ai_quota_exhausted", quota });
    }

    const response = await streamAiText({ systemPrompt, messages });
    const provider = readProvider(response.headers.get("X-AI-Provider"));
    await recordAiUsageEvent({
      requestId,
      userId: auth.user.id,
      capability: "chat.general",
      provider,
      model: provider ? AI_PROVIDER_MODELS[provider] : undefined,
      status: "accepted",
      inputTokens: estimateChatInputTokens(systemPrompt, messages),
      latencyMs: Date.now() - startedAt,
      policyVersion: AI_KNOWLEDGE_VERSION
    });

    requestAcquired = false;
    return releaseWhenStreamEnds(response, () => releaseAiRequest(auth.user!.id));
  } catch (error) {
    if (requestAcquired) {
      await releaseAiRequest(auth.user.id);
      requestAcquired = false;
    }

    await recordAiUsageEvent({
      requestId,
      userId: auth.user.id,
      capability: "chat.general",
      status: "failed",
      inputTokens: estimateChatInputTokens(systemPrompt, messages),
      latencyMs: Date.now() - startedAt,
      policyVersion: AI_KNOWLEDGE_VERSION
    });

    if (error instanceof AiQuotaServiceError) {
      return errorResponse("AI quota service is temporarily unavailable.", 503, { code: "ai_quota_unavailable" });
    }
    if (error instanceof AiGatewayError && error.code === "not_configured") {
      return errorResponse("AI providers are not configured.", 503, { code: "ai_not_configured" });
    }
    if (error instanceof AiGatewayError && error.code === "providers_unavailable") {
      return errorResponse("AI providers are temporarily unavailable.", 503, { code: "ai_providers_unavailable" });
    }

    return errorResponse("All AI providers failed. Please try again.", 502, { code: "ai_providers_failed" });
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

function estimateChatInputTokens(systemPrompt: string, messages: AiConversationMessage[]): number {
  return estimateAiTokens([systemPrompt, ...messages.map((message) => message.content)].join("\n"));
}

function readProvider(value: string | null): AiProvider | undefined {
  return value === "gemini" || value === "groq" ? value : undefined;
}

function releaseWhenStreamEnds(response: Response, release: () => Promise<void>): Response {
  if (!response.body) {
    void release();
    return response;
  }

  const reader = response.body.getReader();
  let released = false;
  const releaseOnce = async () => {
    if (released) return;
    released = true;
    await release();
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await releaseOnce();
          controller.close();
          return;
        }
        if (value) controller.enqueue(value);
      } catch (error) {
        await releaseOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await releaseOnce();
      }
    }
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

function errorResponse(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: NO_STORE_HEADERS });
}
