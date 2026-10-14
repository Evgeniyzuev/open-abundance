import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Operator-only learning report: coordinator outcomes grouped by kind and strategy
 * (approval rate, wishes and challenges per target, share of "it helped" answers, Core growth per target).
 * ?measure=1 first re-measures outcomes for recent approved and done recommendations.
 * Without a control group these are correlations to form the next hypothesis, not proof.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  if (!isGrowthOperator(user.id)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });
  const db = supabase as any;

  let measured: number | null = null;
  if (request.nextUrl.searchParams.get("measure") === "1") {
    const { data, error: measureError } = await db.rpc("measure_coordinator_outcomes", { p_window_days: 30 });
    if (measureError) return NextResponse.json({ error: measureError.message }, { status: 500, headers: NO_STORE_HEADERS });
    measured = Number(data ?? 0);
  }
  const { data: report, error: reportError } = await db.rpc("coordinator_strategy_report");
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ measured, strategies: report ?? [] }, { headers: NO_STORE_HEADERS });
}
