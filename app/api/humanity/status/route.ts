import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { loadDiditConfig } from "@/lib/humanity";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** GET /api/humanity/status: the user's own confirmation state and whether the flow is available. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);

  const db = supabase as any;
  const [{ data: state }, { data: attempt }] = await Promise.all([
    db.from("humanity_verifications").select("humanity_level,verification_status,verified_at").eq("user_id", user.id).maybeSingle(),
    db.from("humanity_verification_attempts").select("status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  return json({
    available: loadDiditConfig() !== null,
    level: Number(state?.humanity_level ?? 0),
    status: state?.verification_status ?? "unverified",
    verifiedAt: state?.verified_at ?? null,
    lastAttemptStatus: attempt?.status ?? null,
    lastAttemptAt: attempt?.created_at ?? null
  }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
