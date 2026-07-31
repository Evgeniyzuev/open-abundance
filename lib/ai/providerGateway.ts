/**
 * Shared server-side provider gateway for every Open Abundance AI capability.
 * Functional routes own validation and response contracts; this module owns
 * provider fallback and guarantees a separate system instruction.
 */

import { NO_STORE_HEADERS } from "@/lib/httpCache";

export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiProvider = "gemini" | "groq";

export type AiGatewayErrorCode = "not_configured" | "all_providers_failed";

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;

  constructor(code: AiGatewayErrorCode) {
    super(code === "not_configured" ? "AI providers are not configured." : "All AI providers failed.");
    this.name = "AiGatewayError";
    this.code = code;
  }
}

type StreamTextOptions = {
  systemPrompt: string;
  messages: AiConversationMessage[];
  temperature?: number;
  maxOutputTokens?: number;
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

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export async function streamAiText({
  systemPrompt,
  messages,
  temperature = 0.7,
  maxOutputTokens = 1_024,
}: StreamTextOptions): Promise<Response> {
  const { geminiKey, groqKey } = configuredProviderKeys();

  if (!geminiKey && !groqKey) {
    throw new AiGatewayError("not_configured");
  }

  if (geminiKey) {
    try {
      return await streamGemini(geminiKey, systemPrompt, messages, temperature, maxOutputTokens);
    } catch {
      console.warn("AI gateway: Gemini streaming failed; trying fallback.");
    }
  }

  if (groqKey) {
    try {
      return await streamGroq(groqKey, systemPrompt, messages, temperature, maxOutputTokens);
    } catch {
      console.warn("AI gateway: Groq streaming failed.");
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
  const { geminiKey, groqKey } = configuredProviderKeys();

  if (!geminiKey && !groqKey) {
    throw new AiGatewayError("not_configured");
  }

  if (geminiKey) {
    try {
      const value = validate(
        await generateGeminiJson(
          geminiKey,
          systemPrompt,
          userPrompt,
          temperature,
          maxOutputTokens
        )
      );
      return { value, provider: "gemini" };
    } catch {
      console.warn("AI gateway: Gemini JSON generation failed; trying fallback.");
    }
  }

  if (groqKey) {
    try {
      const value = validate(
        await generateGroqJson(
          groqKey,
          systemPrompt,
          userPrompt,
          temperature,
          maxOutputTokens
        )
      );
      return { value, provider: "groq" };
    } catch {
      console.warn("AI gateway: Groq JSON generation failed.");
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
    throw new Error(`Gemini API error ${response.status}.`);
  }
  if (!response.body) {
    throw new Error("Gemini returned no response body.");
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
    throw new Error(`Groq API error ${response.status}.`);
  }
  if (!response.body) {
    throw new Error("Groq returned no response body.");
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

function streamedTextResponse(stream: ReadableStream, provider: AiProvider): Response {
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
    throw new Error(`Gemini API error ${response.status}.`);
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
    throw new Error(`Groq API error ${response.status}.`);
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
