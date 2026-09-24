import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isGrowthOperator } from "@/lib/growthOperator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    if (!isGrowthOperator(user.id)) return json({ error: "Growth operator access required." }, 403);

    const configVersion = normalizeConfigVersion(request.nextUrl.searchParams.get("configVersion"));
    const asOfDate = normalizeDate(request.nextUrl.searchParams.get("asOfDate"));
    if (!configVersion || !asOfDate) {
      return json({ error: "configVersion and a valid, non-future asOfDate are required." }, 400);
    }

    const { data, error: reportError } = await (supabase as any).rpc("get_trust_v2_shadow_report", {
      p_config_version: configVersion,
      p_as_of_date: asOfDate
    });
    if (reportError) return json({ error: reportError.message }, reportError.code === "22023" ? 400 : 500);
    return json(data);
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to load Trust v2 shadow report." }, 500);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function normalizeConfigVersion(value: string | null): string | null {
  return value && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value) ? value : null;
}

function normalizeDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value <= new Date().toISOString().slice(0, 10) ? value : null;
}
