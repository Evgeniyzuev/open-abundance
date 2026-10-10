import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { INSTALL_PING_CHALLENGE_ID } from "@/lib/installPing";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET  /api/challenges/install-ping  state of the participant's latest ping round
 * POST /api/challenges/install-ping  register the standalone push subscription and start a round
 *
 * Pings are ordinary reminder_jobs sent by the existing dispatcher. State is derived on read from
 * timestamps, so nothing runs in the background to count missed pings.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const { data, error: stateError } = await (supabase as any).rpc("install_ping_state", { p_user_id: user.id });
  if (stateError) return json({ error: "Could not load the state." }, 500);
  return json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const db = supabase as any;

  const body = (await request.json().catch(() => null)) as {
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    standalone?: unknown;
    timezone?: unknown;
    locale?: unknown;
  } | null;

  const endpoint = typeof body?.subscription?.endpoint === "string" && /^https:\/\//.test(body.subscription.endpoint) ? body.subscription.endpoint.slice(0, 1000) : null;
  const p256dh = typeof body?.subscription?.keys?.p256dh === "string" ? body.subscription.keys.p256dh.slice(0, 500) : null;
  const auth = typeof body?.subscription?.keys?.auth === "string" ? body.subscription.keys.auth.slice(0, 500) : null;
  const timezone = typeof body?.timezone === "string" && /^[A-Za-z0-9_+\-/]{1,64}$/.test(body.timezone) ? body.timezone : null;
  if (!endpoint || !p256dh || !auth || !timezone) return json({ error: "Invalid request." }, 400);
  if (body?.standalone !== true) return json({ error: "Open the installed app and try again." }, 400);

  // The challenge must be accepted so the reward can be claimed through the normal check.
  const { data: accepted, error: acceptedError } = await db
    .from("user_challenges")
    .select("id")
    .eq("user_id", user.id)
    .eq("challenge_id", INSTALL_PING_CHALLENGE_ID)
    .eq("status", "accepted")
    .maybeSingle();
  if (acceptedError) return json({ error: "Could not check the challenge." }, 500);
  if (!accepted) return json({ error: "Accept the challenge first." }, 409);

  const { data: previous } = await db.from("push_subscriptions").select("id,owner_key").eq("endpoint", endpoint).maybeSingle();
  if (previous && previous.owner_key !== `user:${user.id}`) {
    return json({ error: "This device is registered to another account." }, 409);
  }

  const { data: subscription, error: subscriptionError } = await db
    .from("push_subscriptions")
    .upsert({
      owner_key: `user:${user.id}`,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      enabled: true,
      standalone: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "endpoint" })
    .select("id")
    .single();
  if (subscriptionError || !subscription) return json({ error: "Could not save the device." }, 500);

  const { error: scheduleError } = await db.rpc("schedule_install_ping_round", {
    p_user_id: user.id,
    p_subscription_id: subscription.id,
    p_timezone: timezone,
    p_locale: body?.locale === "ru" ? "ru" : "en"
  });
  if (scheduleError) return json({ error: "Could not start the check." }, 500);

  const { data: state } = await db.rpc("install_ping_state", { p_user_id: user.id });
  return json(state);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
