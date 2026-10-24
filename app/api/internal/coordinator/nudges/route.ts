import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCoordinatorNudges, runTelegramDay2 } from "@/lib/coordinatorNudges";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

/**
 * POST /api/internal/coordinator/nudges
 *
 * Called by pg_cron once a day with the shared scanner secret. Queues one "next step" push for
 * each person stuck on a basic step. It sends only when COORDINATOR_NUDGES_ENABLED=1; otherwise
 * it reports what it would have sent (kill switch: unset the variable).
 *
 * GET /api/internal/coordinator/nudges
 *
 * Operator-only preview. Always a dry run: lists who would get which step, short ids only.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TON_SCANNER_SECRET?.trim();
  const provided = request.headers.get("x-ton-scanner-secret")?.trim() ?? "";
  if (!expected || !safeEqual(provided, expected)) return json({ error: "Unauthorized." }, 401);

  const enabled = process.env.COORDINATOR_NUDGES_ENABLED?.trim() === "1";
  // The second-day Telegram message is on by default; TELEGRAM_DAY2_ENABLED=0 switches it off.
  const day2Enabled = process.env.TELEGRAM_DAY2_ENABLED?.trim() !== "0";
  try {
    const db = createServiceSupabaseClient() as any;
    const day2 = await runTelegramDay2(db, { dryRun: !day2Enabled }).catch((day2Error) => ({ error: day2Error instanceof Error ? day2Error.message : "day2 failed" }));
    return json({ ...(await runCoordinatorNudges(db, { dryRun: !enabled })), day2 }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nudge run failed." }, 500);
  }
}

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  if (!isGrowthOperator(user.id)) return json({ error: "Not found." }, 404);
  try {
    return json(await runCoordinatorNudges(createServiceSupabaseClient() as any, { dryRun: true }), 200);
  } catch (runError) {
    return json({ error: runError instanceof Error ? runError.message : "Nudge preview failed." }, 500);
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
