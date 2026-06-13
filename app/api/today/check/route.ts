import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { syncTodayForUser } from "@/lib/serverToday";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = (await request.json().catch(() => ({}))) as { timezone?: string | null };
    const payload = await syncTodayForUser(supabase, user.id, {
      complete: true,
      timezone: body.timezone
    });

    return NextResponse.json(
      {
        ...payload,
        completed: payload.today.status === "completed",
        message: payload.today.status === "completed" ? "Today completed." : "Today target is not reached yet."
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to check Today." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
