import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createDiditSession, HUMANITY_CONSENT_VERSION, HUMANITY_DAILY_ATTEMPTS, HUMANITY_SCENARIO_VERSION, loadDiditConfig } from "@/lib/humanity";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** POST /api/humanity/start: creates a provider verification session after explicit consent. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);

  const body = (await request.json().catch(() => ({}))) as { consent?: unknown; locale?: unknown };
  if (body.consent !== true) return json({ error: "Consent is required.", code: "consent_required" }, 400);

  const config = loadDiditConfig();
  if (!config) return json({ error: "Verification is not available yet.", code: "not_configured" }, 503);

  const db = supabase as any;
  const { data: current } = await db.from("humanity_verifications").select("humanity_level,verification_status").eq("user_id", user.id).maybeSingle();
  if (current && Number(current.humanity_level) >= 2) return json({ error: "Already confirmed.", code: "already_verified" }, 409);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("humanity_verification_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= HUMANITY_DAILY_ATTEMPTS) return json({ error: "Too many attempts today.", code: "rate_limited" }, 429);

  // A new attempt supersedes unfinished ones, so an abandoned check never blocks the user.
  await db.from("humanity_verification_attempts").update({ status: "expired", updated_at: new Date().toISOString() }).eq("user_id", user.id).in("status", ["created", "pending"]);
  await db.from("humanity_verifications").update({ verification_status: "unverified", updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("verification_status", "pending");

  // A new attempt supersedes unfinished ones, so an abandoned check never blocks the user.
  await db.from("humanity_verification_attempts").update({ status: "expired", updated_at: new Date().toISOString() }).eq("user_id", user.id).in("status", ["created", "pending"]);
  await db.from("humanity_verifications").update({ verification_status: "unverified", updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("verification_status", "pending");

  try {
    const session = await createDiditSession(config, {
      userId: user.id,
      callbackUrl: `${request.nextUrl.origin}/?humanity=done`,
      language: body.locale === "ru" ? "ru" : "en"
    });
    const { error: insertError } = await db.from("humanity_verification_attempts").insert({
      user_id: user.id,
      provider: "didit",
      provider_session_id: session.sessionId,
      status: "created",
      consent_version: HUMANITY_CONSENT_VERSION,
      scenario_version: HUMANITY_SCENARIO_VERSION
    });
    if (insertError) return json({ error: "Could not start verification." }, 500);
    return json({ url: session.url }, 200);
  } catch {
    return json({ error: "The verification provider is unavailable. Try again later.", code: "provider_unavailable" }, 502);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
