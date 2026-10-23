import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

/**
 * Who may run an operator action (Nova inbox, AI essay review): a signed-in growth operator, or Claude with
 * CLAUDE_ACTIONS_TOKEN (at least 32 characters). Claude acts only on what the operator approved in the project.
 */
export async function authorizeClaudeOrOperator(request: NextRequest): Promise<{ ok: true; byToken: boolean } | { ok: false; status: number; error: string }> {
  const expected = process.env.CLAUDE_ACTIONS_TOKEN?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected && expected.length >= 32 && safeEqual(provided, expected)) return { ok: true, byToken: true };
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return { ok: false, status: 401, error: error ?? "Unauthorized." };
  if (!isGrowthOperator(user.id)) return { ok: false, status: 404, error: "Not found." };
  return { ok: true, byToken: false };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
