import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** POST /api/referrals/rewards/seen: marks the user's referral rewards as seen. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);

  const db = supabase as any;
  const { error: updateError } = await db
    .from("referral_rewards")
    .update({ seen_at: new Date().toISOString() })
    .eq("referrer_user_id", user.id)
    .is("seen_at", null);
  if (updateError) return json({ error: updateError.message }, 500);
  return json({ ok: true }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
