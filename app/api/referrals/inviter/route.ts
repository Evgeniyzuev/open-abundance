import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { personName } from "@/lib/personName";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Who an invitation code belongs to, for the guest bar ("Anna invited you"). Open to visitors without a session and
 * answers with the public name only; an unknown or switched-off code gives an empty answer, never an error that
 * would tell codes apart.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) return NextResponse.json({}, { headers: NO_STORE_HEADERS });
  try {
    const db = createServiceSupabaseClient();
    const { data: owner } = await db.from("referral_codes").select("user_id").eq("code", code).eq("is_active", true).maybeSingle();
    if (!owner?.user_id) return NextResponse.json({}, { headers: NO_STORE_HEADERS });
    const { data: profile } = await db.from("user_profiles").select("display_name,username").eq("user_id", owner.user_id).is("deleted_at", null).maybeSingle();
    const name = profile ? personName(profile, "") : "";
    return NextResponse.json(name ? { name } : {}, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({}, { headers: NO_STORE_HEADERS });
  }
}
