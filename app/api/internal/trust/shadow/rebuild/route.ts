import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isGrowthOperator } from "@/lib/growthOperator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RebuildBody = {
  configVersion?: unknown;
  asOfDate?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    if (!isGrowthOperator(user.id)) return json({ error: "Growth operator access required." }, 403);

    const body = await request.json().catch(() => ({})) as RebuildBody;
    const configVersion = normalizeConfigVersion(body.configVersion);
    const asOfDate = normalizeDate(body.asOfDate);
    if (!configVersion || !asOfDate) {
      return json({ error: "configVersion and a valid, non-future asOfDate are required." }, 400);
    }

    const { data, error: rebuildError } = await (supabase as any).rpc("rebuild_trust_v2_shadow", {
      p_config_version: configVersion,
      p_as_of_date: asOfDate
    });
    if (rebuildError) return json({ error: rebuildError.message }, rebuildError.code === "22023" ? 400 : 500);
    return json({ report: data });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to rebuild Trust v2 shadow." }, 500);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function normalizeConfigVersion(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) return null;
  return value;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value <= new Date().toISOString().slice(0, 10) ? value : null;
}
