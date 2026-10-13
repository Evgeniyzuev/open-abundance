"use client";

import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

export type AiToolFailure = "offline" | "signin" | "quota" | "error";

export type AiToolResult = { ok: true; payload: unknown } | { ok: false; reason: AiToolFailure };

/** Posts to an AI tool route with the session token and maps refusals to a calm, specific reason. */
export async function postAiTool(url: string, body: unknown): Promise<AiToolResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, reason: "offline" };
  try {
    const response = await fetchWithSupabaseAuth(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok) return { ok: true, payload };
    if (response.status === 401) return { ok: false, reason: "signin" };
    if (response.status === 429) return { ok: false, reason: "quota" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Shared messages for refusals; each tool keeps its own wording for "error" and "offline". */
export const AI_TOOL_FAILURE_KEYS: Partial<Record<AiToolFailure, MessageKey>> = {
  signin: "ai.tools.signIn",
  quota: "ai.tools.quota"
};
