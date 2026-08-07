import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PERIOD_TYPES = ["day", "month", "year", "lifetime"] as const;
const METRIC_KEYS = [
  "wallet_inflows_total",
  "wallet_outflows_total",
  "marketplace_sales_gross",
  "marketplace_purchases_gross",
  "marketplace_completed_sales_count",
  "marketplace_completed_purchase_count",
  "core_growth_total",
  "core_level_end"
] as const;

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const { data, error: queryError } = await supabase
    .from("user_economy_metric_visibility")
    .select("metric_key, period_type, is_public, updated_at")
    .eq("user_id", user.id)
    .order("metric_key")
    .order("period_type");
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ visibility: data ?? [] }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  let body: { metricKey?: unknown; periodType?: unknown; isPublic?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const metricKey = typeof body.metricKey === "string" ? body.metricKey : "";
  const periodType = typeof body.periodType === "string" ? body.periodType : "";
  if (!METRIC_KEYS.includes(metricKey as (typeof METRIC_KEYS)[number])) {
    return NextResponse.json({ error: "This metric cannot be public." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!PERIOD_TYPES.includes(periodType as (typeof PERIOD_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid period type." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (typeof body.isPublic !== "boolean") {
    return NextResponse.json({ error: "isPublic must be a boolean." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data, error: upsertError } = await supabase
    .from("user_economy_metric_visibility")
    .upsert({ user_id: user.id, metric_key: metricKey, period_type: periodType, is_public: body.isPublic, updated_at: new Date().toISOString() }, { onConflict: "user_id,metric_key,period_type" })
    .select("metric_key, period_type, is_public, updated_at")
    .single();
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ visibility: data }, { headers: NO_STORE_HEADERS });
}
