import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

// The browser's IANA time zone ("Europe/Moscow"), so reminders and coordinator nudges arrive in the person's daytime.
export async function PUT(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = await request.json().catch(() => null) as { timezone?: unknown } | null;
    const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "";
    if (!timezone || timezone.length > 64) return NextResponse.json({ error: "Invalid time zone." }, { status: 400, headers: NO_STORE_HEADERS });
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      return NextResponse.json({ error: "Unknown time zone." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { error: updateError } = await (supabase as any)
      .from("user_profiles")
      .update({ timezone, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ timezone }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to save time zone." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
