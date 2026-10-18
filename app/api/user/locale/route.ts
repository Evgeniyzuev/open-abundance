import { NextRequest, NextResponse } from "next/server";
import { isAppLocale } from "@/lib/locales";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

// The interface language is saved on the server, like the other profile fields, so it does not
// depend on browser write access to user_profiles.
export async function PUT(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await request.json().catch(() => null) as { locale?: unknown } | null;
    const locale = body?.locale;
    if (!isAppLocale(locale)) {
      return NextResponse.json({ error: "Unsupported language." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error: updateError } = await supabase
      .from("user_profiles")
      .update({ default_locale: locale, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("default_locale")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!data) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    return NextResponse.json({ locale: data.default_locale }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update language." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
