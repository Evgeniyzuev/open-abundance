import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { normalizeAfterburnKeepAmount } from "@/lib/coreAfterburn";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type SettingsRow = { enabled: boolean; keep_amount: number | string; updated_at: string };
type RunRow = { run_date: string; status: "moved" | "failed"; amount: number | string };

function payload(settings: SettingsRow | null, lastRun: RunRow | null) {
  return {
    enabled: settings?.enabled ?? false,
    keepAmount: Number(settings?.keep_amount ?? 0),
    lastRun: lastRun ? { date: lastRun.run_date, status: lastRun.status, amount: Number(lastRun.amount) } : null
  };
}

async function lastRun(supabase: any, userId: string): Promise<RunRow | null> {
  const { data } = await supabase
    .from("core_afterburn_runs")
    .select("run_date,status,amount")
    .eq("user_id", userId)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Afterburn settings of the signed-in person and the last night move.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const db = supabase as any;
    const [{ data: settings, error: settingsError }, run] = await Promise.all([
      db.from("core_afterburn_settings").select("enabled,keep_amount,updated_at").eq("user_id", user.id).maybeSingle(),
      lastRun(db, user.id)
    ]);
    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json(payload(settings, run), { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to load Afterburn." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

// Turns Afterburn on or off and sets the kept Wallet amount. The move itself runs only in the night job.
export async function PUT(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown; keepAmount?: unknown };
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false." }, { status: 400, headers: NO_STORE_HEADERS });
    const keepAmount = normalizeAfterburnKeepAmount(body.keepAmount);
    if (keepAmount === null) return NextResponse.json({ error: "Kept amount must be 0 or more." }, { status: 400, headers: NO_STORE_HEADERS });

    const db = supabase as any;
    const { data, error: upsertError } = await db
      .from("core_afterburn_settings")
      .upsert({ user_id: user.id, enabled: body.enabled, keep_amount: keepAmount, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("enabled,keep_amount,updated_at")
      .single();
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json(payload(data, await lastRun(db, user.id)), { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to save Afterburn." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
