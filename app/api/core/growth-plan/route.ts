import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import type { Json } from "@/lib/database.types";

type GrowthPlanRequest = {
  calculatedDaysToGoal?: number | null;
  dailyAdditions?: number;
  metadata?: Record<string, unknown>;
  reinvestPercent?: number;
  startCore?: number;
  targetType?: "core_amount" | "daily_income";
  targetValue?: number;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data, error: planError } = await supabase
      .from("user_core_growth_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError) {
      return NextResponse.json({ error: planError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ plan: data ?? null }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load Core growth plan." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = (await request.json().catch(() => ({}))) as GrowthPlanRequest;
    const targetType = body.targetType === "daily_income" ? "daily_income" : "core_amount";
    const targetValue = cleanMoney(body.targetValue);
    const startCore = cleanMoney(body.startCore);
    const dailyAdditions = cleanMoney(body.dailyAdditions);
    const reinvestPercent = cleanPercent(body.reinvestPercent);
    const calculatedDaysToGoal = cleanDays(body.calculatedDaysToGoal);

    if (targetValue <= 0) {
      return NextResponse.json({ error: "Target value must be greater than 0." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { error: deactivateError } = await supabase
      .from("user_core_growth_plans")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const { data: plan, error: insertError } = await supabase
      .from("user_core_growth_plans")
      .insert({
        calculated_days_to_goal: calculatedDaysToGoal,
        daily_additions: dailyAdditions,
        is_active: true,
        metadata: toJsonRecord(body.metadata),
        reinvest_percent: reinvestPercent,
        start_core: startCore,
        target_type: targetType,
        target_value: targetValue,
        user_id: user.id
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ plan }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to save Core growth plan." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function cleanMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function cleanPercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function cleanDays(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJsonRecord(value: unknown): Json {
  if (!isRecord(value)) return {};

  const result: { [key: string]: Json | undefined } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null
      || typeof entry === "string"
      || typeof entry === "number"
      || typeof entry === "boolean"
    ) {
      result[key] = entry;
    }
  }

  return result;
}
