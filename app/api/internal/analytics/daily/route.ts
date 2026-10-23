import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { analyticsSalt, buildDailyReport, loadAnalyticsSnapshot, MIN_GROUP } from "@/lib/dailyAnalytics";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * GET /api/internal/analytics/daily
 *
 * The daily analytics report (summary, metrics, pseudonymous details) for `pnpm analytics:daily --source=api`.
 * Lets the report run on a phone or in a cloud session without the database key: the caller holds only
 * ANALYTICS_READ_TOKEN, which can read this aggregated report and nothing else. Operators may call it signed in.
 * Read-only; groups of personal attributes are never smaller than MIN_GROUP.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.ANALYTICS_READ_TOKEN?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const byToken = Boolean(expected && expected.length >= 32 && safeEqual(provided, expected));
  if (!byToken) {
    const { user, error } = await getAuthenticatedUser(request);
    if (!user) return json({ error: error ?? "Unauthorized." }, 401);
    if (!isGrowthOperator(user.id)) return json({ error: "Not found." }, 404);
  }

  const salt = analyticsSalt(process.env);
  if (!salt) return json({ error: "Analytics salt is not configured." }, 500);
  const requested = Number(request.nextUrl.searchParams.get("minGroup"));
  const minGroup = Number.isFinite(requested) && requested > MIN_GROUP ? requested : MIN_GROUP;

  try {
    const snapshot = await loadAnalyticsSnapshot(createServiceSupabaseClient() as any);
    return json(buildDailyReport(snapshot, { salt, minGroup }), 200);
  } catch (loadError) {
    return json({ error: loadError instanceof Error ? loadError.message : "Could not build the report." }, 500);
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
