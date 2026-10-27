import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { personName } from "@/lib/personName";
import { FIRST_STEP_LOGIC } from "@/lib/questPath";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Who an invitation code belongs to, for the guest bar ("Anna invited you"). Open to visitors without a session and
 * answers with the public name only; an unknown or switched-off code gives an empty answer, never an error that
 * would tell codes apart. Signed in and without a code: who invited this person and whether their first quest is done,
 * so a new member who came by a friend's link starts on the first quest with that name.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!code && request.headers.get("authorization")) return invitedMember(request);
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

async function invitedMember(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  try {
    const db = createServiceSupabaseClient();
    const { data: edge } = await db.from("referral_edges").select("referrer_user_id").eq("referral_user_id", user.id).maybeSingle();
    if (!edge?.referrer_user_id) return NextResponse.json({}, { headers: NO_STORE_HEADERS });
    const [{ data: profile }, { data: firstStep }] = await Promise.all([
      db.from("user_profiles").select("display_name,username").eq("user_id", edge.referrer_user_id).is("deleted_at", null).maybeSingle(),
      db.from("challenges").select("id,user_challenges(status)").eq("verification_logic", FIRST_STEP_LOGIC).eq("user_challenges.user_id", user.id).maybeSingle()
    ]);
    const name = profile ? personName(profile, "") : "";
    const rows = ((firstStep as { user_challenges?: { status: string | null }[] } | null)?.user_challenges ?? []);
    const firstStepDone = rows.some((row) => String(row.status).trim().toLowerCase() === "completed");
    return NextResponse.json(name ? { name, firstStepDone } : {}, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({}, { headers: NO_STORE_HEADERS });
  }
}
