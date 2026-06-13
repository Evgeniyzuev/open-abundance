import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { syncTodayForUser } from "@/lib/serverToday";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const payload = await syncTodayForUser(supabase, user.id, {
      markIntroSeen: true,
      timezone: request.nextUrl.searchParams.get("timezone")
    });

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load Today." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
