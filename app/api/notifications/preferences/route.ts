import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import type { AppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const CATEGORIES = ["deals", "disputes", "wallet", "rewards", "team", "confirmations", "reminders", "system"] as const;
type Category = typeof CATEGORIES[number];

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  const { data, error: queryError } = await (supabase as any)
    .from("notification_preferences")
    .select("category,in_app_enabled,push_enabled,locale,updated_at")
    .eq("user_id", user.id);
  if (queryError) return json({ error: queryError.message }, 500);
  return json({ preferences: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  const body = await request.json().catch(() => ({})) as {
    category?: unknown;
    inAppEnabled?: unknown;
    pushEnabled?: unknown;
    locale?: unknown;
  };
  const category = typeof body.category === "string" && CATEGORIES.includes(body.category as Category) ? body.category as Category : null;
  const locale: AppLocale = body.locale === "ru" ? "ru" : "en";
  if (!category || typeof body.inAppEnabled !== "boolean" || typeof body.pushEnabled !== "boolean") {
    return json({ error: "Invalid notification preference." }, 400);
  }
  if (["deals", "disputes", "wallet", "rewards", "system"].includes(category) && !body.inAppEnabled) {
    return json({ error: "This activity must remain available in the app." }, 400);
  }
  const { error: upsertError } = await (supabase as any).from("notification_preferences").upsert({
    user_id: user.id,
    category,
    in_app_enabled: body.inAppEnabled,
    push_enabled: body.pushEnabled,
    locale,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,category" });
  if (upsertError) return json({ error: upsertError.message }, 500);
  return json({ updated: true });
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
