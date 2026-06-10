import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/ai/knowledge";
import type { AppLocale } from "@/lib/i18n";

export const runtime = "edge";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: IncomingMessage[];
  locale?: string;
};

/**
 * POST /api/ai/chat
 *
 * Streams an AI response using Google Gemini as primary provider
 * with automatic fallback to Groq if Gemini fails.
 *
 * Request body: { messages: Array<{role, content}>, locale?: "ru" | "en" }
 * Response: streaming text (newline-delimited chunks)
 */
export async function POST(request: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages array is required." }, { status: 400 });
  }

  const locale: AppLocale = body.locale === "ru" ? "ru" : "en";
  const systemPrompt = buildSystemPrompt(locale);

  // Build Gemini-format contents from messages
  const geminiContents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  // Build Groq/OpenAI-format messages
  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
  ];

  // Try Gemini first, then fallback to Groq
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    try {
      return await streamGemini(geminiKey, systemPrompt, geminiContents);
    } catch (geminiError) {
      console.warn("Gemini failed, trying Groq fallback:", geminiError);
    }
  }

  if (groqKey) {
    try {
      return await streamGroq(groqKey, openaiMessages);
    } catch (groqError) {
      console.error("Groq fallback also failed:", groqError);
    }
  }

  if (!geminiKey && !groqKey) {
    return NextResponse.json(
      { error: "AI providers not configured. Set GEMINI_API_KEY or GROQ_API_KEY in .env" },
      { status: 503 }
    );
  }

  return NextResponse.json({ error: "All AI providers failed. Please try again." }, { status: 502 });
}

async function streamGemini(
  apiKey: string,
  systemInstruction: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Gemini returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

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
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr) as {
                  candidates?: Array<{
                    content?: { parts?: Array<{ text?: string }> };
                  }>;
                };
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(new TextEncoder().encode(text + "\n"));
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-AI-Provider": "gemini",
    },
  });
}

async function streamGroq(
  apiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): Promise<Response> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Groq returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

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
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr) as {
                  choices?: Array<{
                    delta?: { content?: string };
                  }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(new TextEncoder().encode(content + "\n"));
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-AI-Provider": "groq",
    },
  });
}