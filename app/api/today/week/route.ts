import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * The person's own last two weeks of daily targets (date, status, progress, target) for the weekly recap. The device
 * says which local day is "today" (the timezone lives there); the server only returns the rows of the signed-in person.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const today = request.nextUrl.searchParams.get("today") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) return NextResponse.json({ error: "A local date is required." }, { status: 400, headers: NO_STORE_HEADERS });
    const from = new Date(Date.parse(today) - 120 * 86_400_000).toISOString().slice(0, 10);
    const { data, error: readError } = await supabase
      .from("user_today_instances")
      .select("local_date,status,progress_core,target_core")
      .eq("user_id", user.id)
      .gte("local_date", from)
      .lte("local_date", today)
      .order("local_date", { ascending: false });
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ rows: data ?? [] }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to load the daily targets." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
