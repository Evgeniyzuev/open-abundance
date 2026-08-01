/**
 * Shared server-side provider gateway for every Open Abundance AI capability.
 * Functional routes own validation and response contracts; this module owns
 * provider fallback and guarantees a separate system instruction.
 */

import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  getAiProviderHealth,
  markAiProviderFailure,
  markAiProviderSuccess,
  type AiProviderName
} from "@/lib/ai/serverUsage";
import { getOpenRouterModel, type OpenRouterModelId } from "@/lib/ai/openrouterModels";
import {
  AiConnectionServiceError,
  getOpenRouterApiKey,
  markOpenRouterConnectionInvalid,
  markOpenRouterConnectionUsed,
  type AiRouteMode
} from "@/lib/ai/userAiConnections";

export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiProvider = AiProviderName;
export type AiResponseProvider = AiProvider | "openrouter";

export type AiGatewayErrorCode =
  | "not_configured"
  | "providers_unavailable"
  | "all_providers_failed"
  | "byok_not_configured"
  | "byok_invalid"
  | "byok_credits_exhausted"
  | "byok_rate_limited"
  | "byok_failed"
  | "model_not_allowed";

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;

  constructor(code: AiGatewayErrorCode) {
    super(
      code === "not_configured"
        ? "AI providers are not configured."
        : code === "providers_unavailable"
          ? "AI providers are temporarily unavailable."
          : code === "byok_not_configured"
            ? "OpenRouter is not connected."
            : code === "byok_invalid"
              ? "The OpenRouter key is invalid."
              : code === "byok_credits_exhausted"
                ? "OpenRouter credits or key limit are exhausted."
                : code === "byok_rate_limited"
                  ? "OpenRouter request rate limit reached."
                  : code === "model_not_allowed"
                    ? "This OpenRouter model is not available in the app."
                    : code === "byok_failed"
                      ? "OpenRouter could not complete the request."
                      : "All AI providers failed."
    );
    this.name = "AiGatewayError";
    this.code = code;
  }
}

class AiProviderRequestError extends Error {
  readonly provider: AiProvider;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  readonly failureCode: string;

  constructor(provider: AiProvider, status: number | null, failureCode: string, retryAfterMs: number | null = null) {
    super(`${provider} provider request failed.`);
    this.name = "AiProviderRequestError";
    this.provider = provider;
    this.status = status;
    this.failureCode = failureCode;
    this.retryAfterMs = retryAfterMs;
  }
}

type StreamTextOptions = {
  systemPrompt: string;
  messages: AiConversationMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  routeMode?: AiRouteMode;
  userId?: string;
  modelId?: OpenRouterModelId;
};

type GenerateJsonOptions<T> = {
  systemPrompt: string;
  userPrompt: string;
  validate: (value: unknown) => T;
  temperature?: number;
  maxOutputTokens?: number;
};

export type AiJsonResult<T> = {
  value: T;
  provider: AiProvider;
};

export const AI_PROVIDER_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile"
};

const GEMINI_MODEL = AI_PROVIDER_MODELS.gemini;
const GROQ_MODEL = AI_PROVIDER_MODELS.groq;

export async function streamAiText({
  systemPrompt,
  messages,
  temperature = 0.7,
  maxOutputTokens = 1_024,
  routeMode = "system",
  userId,
  modelId,
}: StreamTextOptions): Promise<Response> {
  if (routeMode === "byok") {
    if (!userId) throw new AiGatewayError("byok_not_configured");
    if (!modelId || !getOpenRouterModel(modelId)) throw new AiGatewayError("model_not_allowed");
    return streamOpenRouter({ userId, modelId, systemPrompt, messages, temperature, maxOutputTokens });
  }

  const providers = await getAvailableProviders();

  for (const { provider, apiKey } of providers) {
    try {
      const response = provider === "gemini"
        ? await streamGemini(apiKey, systemPrompt, messages, temperature, maxOutputTokens)
        : await streamGroq(apiKey, systemPrompt, messages, temperature, maxOutputTokens);
      await markAiProviderSuccess(provider);
      return response;
    } catch (error) {
      await noteProviderFailure(provider, error);
    }
  }

  throw new AiGatewayError("all_providers_failed");
}

export async function generateAiJson<T>({
  systemPrompt,
  userPrompt,
  validate,
  temperature = 0.25,
  maxOutputTokens = 1_800,
}: GenerateJsonOptions<T>): Promise<AiJsonResult<T>> {
  const providers = await getAvailableProviders();

  for (const { provider, apiKey } of providers) {
    try {
      const rawValue = provider === "gemini"
        ? await generateGeminiJson(apiKey, systemPrompt, userPrompt, temperature, maxOutputTokens)
        : await generateGroqJson(apiKey, systemPrompt, userPrompt, temperature, maxOutputTokens);
      const value = validate(rawValue);
      await markAiProviderSuccess(provider);
      return { value, provider };
    } catch (error) {
      await noteProviderFailure(provider, error);
    }
  }

  throw new AiGatewayError("all_providers_failed");
}

function configuredProviderKeys() {
  return {
    geminiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    groqKey: process.env.GROQ_API_KEY,
  };
}

async function getAvailableProviders(): Promise<Array<{ provider: AiProvider; apiKey: string }>> {
  const { geminiKey, groqKey } = configuredProviderKeys();
  const configured = [
    geminiKey ? { provider: "gemini" as const, apiKey: geminiKey } : null,
    groqKey ? { provider: "groq" as const, apiKey: groqKey } : null
  ].filter((item): item is { provider: AiProvider; apiKey: string } => Boolean(item));

  if (!configured.length) throw new AiGatewayError("not_configured");

  const available: Array<{ provider: AiProvider; apiKey: string }> = [];
  for (const item of configured) {
    const health = await getAiProviderHealth(item.provider);
    const blocked = health?.blockedUntil ? Date.parse(health.blockedUntil) > Date.now() : false;
    if (health && (!health.enabled || blocked)) continue;
    available.push(item);
  }

  if (!available.length) throw new AiGatewayError("providers_unavailable");
  return available;
}

async function streamOpenRouter({
  userId,
  modelId,
  systemPrompt,
  messages,
  temperature,
  maxOutputTokens,
}: {
  userId: string;
  modelId: OpenRouterModelId;
  systemPrompt: string;
  messages: AiConversationMessage[];
  temperature: number;
  maxOutputTokens: number;
}): Promise<Response> {
  let connection: { apiKey: string; connectionId: string };
  try {
    connection = await getOpenRouterApiKey(userId);
  } catch (error) {
    if (error instanceof AiConnectionServiceError) {
      throw new AiGatewayError(
        error.code === "not_configured"
          ? "byok_not_configured"
          : error.code === "invalid"
            ? "byok_invalid"
            : "byok_failed"
      );
    }
    throw new AiGatewayError("byok_failed");
  }

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.apiKey}`,
        "X-Title": "Open Abundance"
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature,
        max_tokens: maxOutputTokens,
        stream: true
      })
    });
  } catch {
    throw new AiGatewayError("byok_failed");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      await markOpenRouterConnectionInvalid(connection.connectionId);
      throw new AiGatewayError("byok_invalid");
    }
    if (response.status === 402) throw new AiGatewayError("byok_credits_exhausted");
    if (response.status === 429) throw new AiGatewayError("byok_rate_limited");
    throw new AiGatewayError("byok_failed");
  }
  if (!response.body) throw new AiGatewayError("byok_failed");

  await markOpenRouterConnectionUsed(connection.connectionId);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const text = readOpenRouterStreamText(line);
            if (text) controller.enqueue(encoder.encode(`${text}\n`));
          }
        }

        const finalText = readOpenRouterStreamText(buffer);
        if (finalText) controller.enqueue(encoder.encode(`${finalText}\n`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return streamedTextResponse(stream, "openrouter");
}

async function noteProviderFailure(provider: AiProvider, error: unknown): Promise<void> {
  const providerError = error instanceof AiProviderRequestError ? error : null;
  const failureCode = providerError?.failureCode ?? "provider_error";
  await markAiProviderFailure(provider, failureCode, providerError?.retryAfterMs);
  const status = providerError?.status ? ` ${providerError.status}` : "";
  console.warn(`AI gateway: ${provider} failed${status}; trying fallback.`);
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1_000));

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

async function streamGemini(
  apiKey: string,
  systemPrompt: string,
  messages: AiConversationMessage[],
  temperature: number,
  maxOutputTokens: number
): Promise<Response> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: { temperature, maxOutputTokens },
      }),
    }
  );

  if (!response.ok) {
    throw new AiProviderRequestError("gemini", response.status, `http_${response.status}`, retryAfterMs(response));
  }
  if (!response.body) {
    throw new AiProviderRequestError("gemini", null, "empty_response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const text = readGeminiStreamText(line);
            if (text) controller.enqueue(encoder.encode(`${text}\n`));
          }
        }

        const finalText = readGeminiStreamText(buffer);
        if (finalText) controller.enqueue(encoder.encode(`${finalText}\n`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return streamedTextResponse(stream, "gemini");
}

async function streamGroq(
  apiKey: string,
  systemPrompt: string,
  messages: AiConversationMessage[],
  temperature: number,
  maxOutputTokens: number
): Promise<Response> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature,
      max_tokens: maxOutputTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new AiProviderRequestError("groq", response.status, `http_${response.status}`, retryAfterMs(response));
  }
  if (!response.body) {
    throw new AiProviderRequestError("groq", null, "empty_response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const text = readGroqStreamText(line);
            if (text) controller.enqueue(encoder.encode(`${text}\n`));
          }
        }

        const finalText = readGroqStreamText(buffer);
        if (finalText) controller.enqueue(encoder.encode(`${finalText}\n`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return streamedTextResponse(stream, "groq");
}

function streamedTextResponse(stream: ReadableStream, provider: AiResponseProvider): Response {
  return new Response(stream, {
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "X-AI-Provider": provider,
    },
  });
}

function readGeminiStreamText(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const json = line.slice(6).trim();
  if (!json || json === "[DONE]") return null;

  try {
    const payload = JSON.parse(json) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

function readGroqStreamText(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const json = line.slice(6).trim();
  if (!json || json === "[DONE]") return null;

  try {
    const payload = JSON.parse(json) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return payload.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

function readOpenRouterStreamText(line: string): string | null {
  return readGroqStreamText(line);
}

async function generateGeminiJson(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxOutputTokens: number
): Promise<unknown> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    throw new AiProviderRequestError("gemini", response.status, `http_${response.status}`, retryAfterMs(response));
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return parseJson(payload.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function generateGroqJson(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxOutputTokens: number
): Promise<unknown> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new AiProviderRequestError("groq", response.status, `http_${response.status}`, retryAfterMs(response));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseJson(payload.choices?.[0]?.message?.content);
}

function parseJson(value: string | undefined): unknown {
  if (!value) throw new Error("AI provider returned an empty JSON response.");
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}
