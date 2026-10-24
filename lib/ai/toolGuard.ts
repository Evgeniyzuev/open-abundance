import { NextRequest, NextResponse } from "next/server";
import { AiQuotaServiceError, refundAiChatMessage, reserveAiChatMessage } from "@/lib/ai/serverUsage";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

/**
 * Sign-in and quota for AI helper tools. Reuses the chat quota tables with a separate
 * capability bucket, so one explicit tap costs one small quota write and no new tables.
 */
export const AI_TOOL_LIMITS = {
  "tools.organize": { dayLimit: 30, monthLimit: 300 }
} as const;

export type AiToolBucket = keyof typeof AI_TOOL_LIMITS;

export type AiToolGuard =
  | { ok: true; userId: string; refund: () => Promise<void> }
  | { ok: false; response: NextResponse };

export async function guardAiTool(request: NextRequest, bucket: AiToolBucket): Promise<AiToolGuard> {
  const { user } = await getAuthenticatedUser(request);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Sign in to use AI tools.", code: "ai_sign_in_required" }, { status: 401, headers: NO_STORE_HEADERS }) };
  }

  try {
    const quota = await reserveAiChatMessage(user.id, { capability: bucket, ...AI_TOOL_LIMITS[bucket] });
    if (!quota.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "AI tool quota exhausted.", code: "ai_quota_exhausted", dayLimit: quota.dayLimit, monthLimit: quota.monthLimit },
          { status: 429, headers: NO_STORE_HEADERS }
        )
      };
    }
  } catch (error) {
    if (error instanceof AiQuotaServiceError) {
      return { ok: false, response: NextResponse.json({ error: "AI quota service is temporarily unavailable.", code: "ai_quota_unavailable" }, { status: 503, headers: NO_STORE_HEADERS }) };
    }
    throw error;
  }

  return { ok: true, userId: user.id, refund: () => refundAiChatMessage(user.id, bucket) };
}
