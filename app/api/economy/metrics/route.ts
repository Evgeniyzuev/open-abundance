import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PERIOD_TYPES = ["day", "month", "year", "lifetime"] as const;
type PeriodType = (typeof PERIOD_TYPES)[number];

function currentPeriodKey(periodType: PeriodType) {
  if (periodType === "lifetime") return "lifetime";
  const now = new Date();
  const year = now.getUTCFullYear().toString().padStart(4, "0");
  const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  if (periodType === "year") return year;
  if (periodType === "month") return `${year}-${month}`;
  return `${year}-${month}-${now.getUTCDate().toString().padStart(2, "0")}`;
}

function isValidPeriodKey(periodType: PeriodType, periodKey: string) {
  if (periodType === "lifetime") return periodKey === "lifetime";
  const pattern = periodType === "day" ? /^\d{4}-\d{2}-\d{2}$/ : periodType === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}$/;
  return pattern.test(periodKey);
}

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) {
    return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const searchParams = request.nextUrl.searchParams;
  const periodTypeParam = searchParams.get("periodType") ?? "month";
  if (!PERIOD_TYPES.includes(periodTypeParam as PeriodType)) {
    return NextResponse.json({ error: "Invalid period type." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const periodType = periodTypeParam as PeriodType;
  const periodKey = searchParams.get("periodKey") ?? currentPeriodKey(periodType);
  if (!isValidPeriodKey(periodType, periodKey)) {
    return NextResponse.json({ error: "Invalid period key." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const readMetric = async () => supabase
    .from("user_economy_metrics")
    .select("*")
    .eq("user_id", user.id)
    .eq("period_type", periodType)
    .eq("period_key", periodKey)
    .eq("currency_code", "OA$")
    .maybeSingle();

  let { data: metric, error: metricError } = await readMetric();
  if (metricError) {
    return NextResponse.json({ error: metricError.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (!metric) {
    const { error: rebuildError } = await supabase.rpc("rebuild_user_economy_metrics", { p_user_id: user.id });
    if (rebuildError) {
      return NextResponse.json({ error: rebuildError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    await supabase.rpc("reconcile_user_economy_metrics", { p_user_id: user.id });
    ({ data: metric, error: metricError } = await readMetric());
    if (metricError) {
      return NextResponse.json({ error: metricError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
  }

  return NextResponse.json({ metric, periodType, periodKey }, { headers: NO_STORE_HEADERS });
}
