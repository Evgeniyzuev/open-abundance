import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeUsernameInput, usernameBase, usernameCandidates, validateUsername } from "@/lib/username";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/social/profile/username?u=name   availability of a nickname for the signed-in person
 * PUT /api/social/profile/username          { username } change the nickname
 *
 * Rules live in lib/username.ts and in the database (format check, unique index, reserved words,
 * change limits). Availability checks are throttled per person so the endpoint cannot be used to
 * list taken names.
 */
const CHECKS_PER_MINUTE = 30;
const recentChecks = new Map<string, number[]>();

function throttled(userId: string): boolean {
  const now = Date.now();
  const recent = (recentChecks.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= CHECKS_PER_MINUTE) {
    recentChecks.set(userId, recent);
    return true;
  }
  recent.push(now);
  recentChecks.set(userId, recent);
  return false;
}

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  if (throttled(user.id)) return json({ error: "Too many checks. Try again in a minute." }, 429);

  const input = normalizeUsernameInput(request.nextUrl.searchParams.get("u"));
  const format = validateUsername(input);
  if (!format.ok && format.reason !== "reserved") return json({ status: "invalid", reason: format.reason });

  const db = supabase as any;
  const { data: status, error: statusError } = await db.rpc("username_status", { p_username: input, p_user_id: user.id });
  if (statusError) return json({ error: "Could not check the nickname." }, 500);

  const suggestions: string[] = [];
  if (status === "taken" || status === "reserved") {
    for (const candidate of usernameCandidates(usernameBase({ displayName: input }), Math.random, 2).slice(0, 8)) {
      if (suggestions.length >= 3) break;
      const { data } = await db.rpc("username_status", { p_username: candidate, p_user_id: user.id });
      if (data === "available") suggestions.push(candidate);
    }
  }
  return json({ status, suggestions });
}

export async function PUT(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);

  const body = (await request.json().catch(() => null)) as { username?: unknown } | null;
  const format = validateUsername(body?.username);
  if (!format.ok) return json({ code: format.reason === "reserved" ? "reserved" : "invalid", reason: format.reason }, 400);

  const { data, error: claimError } = await (supabase as any).rpc("claim_username", { p_user_id: user.id, p_username: format.value, p_source: "user" });
  if (claimError) return json({ error: "Could not change the nickname." }, 500);
  const row = Array.isArray(data) ? data[0] : data;
  const code: string = row?.result_code ?? "invalid";

  if (code === "ok" || code === "unchanged") {
    if (code === "ok") {
      // The event carries no nickname: it is a count, not an identity.
      await recordProductEvent({ entityType: "profile", eventName: "username_changed", source: "server", userId: user.id });
    }
    return json({ code, username: row.new_username });
  }
  return json({ code }, code === "taken" || code === "cooldown" || code === "limit" ? 409 : 400);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
