import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  const { data, error: queryError } = await (supabase as any)
    .from("push_subscriptions")
    .select("id,device_label,user_agent,enabled,created_at,last_seen_at,last_success_at")
    .eq("owner_key", `user:${user.id}`)
    .order("last_seen_at", { ascending: false });
  if (queryError) return json({ error: queryError.message }, 500);
  return json({ devices: data ?? [] });
}

/** Registers this browser as a push device for the signed-in user. A device the user already switched off stays off. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  const body = await request.json().catch(() => null) as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; deviceLabel?: unknown } | null;
  const endpoint = typeof body?.subscription?.endpoint === "string" && body.subscription.endpoint.length <= 2_000 && body.subscription.endpoint.startsWith("https://") ? body.subscription.endpoint : null;
  const p256dh = typeof body?.subscription?.keys?.p256dh === "string" && body.subscription.keys.p256dh.length <= 500 ? body.subscription.keys.p256dh : null;
  const auth = typeof body?.subscription?.keys?.auth === "string" && body.subscription.keys.auth.length <= 500 ? body.subscription.keys.auth : null;
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 100) || null : null;
  if (!endpoint || !p256dh || !auth) return json({ error: "Invalid push subscription." }, 400);

  const ownerKey = `user:${user.id}`;
  const now = new Date().toISOString();
  const db = supabase as any;
  const { data: existing } = await db.from("push_subscriptions").select("id,owner_key,enabled").eq("endpoint", endpoint).maybeSingle();
  if (existing && existing.owner_key === ownerKey) {
    await db.from("push_subscriptions").update({ p256dh, auth, last_seen_at: now, updated_at: now }).eq("id", existing.id);
    return json({ registered: true, enabled: Boolean(existing.enabled) });
  }
  if (existing) {
    // The browser now belongs to another account: stop what was queued for the previous owner.
    await db.from("notification_deliveries")
      .update({ status: "cancelled", last_error: "Subscription owner changed", updated_at: now })
      .eq("subscription_id", existing.id)
      .in("status", ["queued", "processing"]);
  }
  const { error: upsertError } = await db.from("push_subscriptions").upsert({
    owner_key: ownerKey,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    device_label: deviceLabel,
    enabled: true,
    last_seen_at: now,
    updated_at: now
  }, { onConflict: "endpoint" });
  if (upsertError) return json({ error: upsertError.message }, 500);
  return json({ registered: true, enabled: true });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  const body = await request.json().catch(() => ({})) as { subscriptionId?: unknown };
  const subscriptionId = typeof body.subscriptionId === "string" && isUuid(body.subscriptionId) ? body.subscriptionId : null;
  if (!subscriptionId) return json({ error: "Subscription ID is required." }, 400);
  const { data, error: updateError } = await (supabase as any)
    .from("push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("owner_key", `user:${user.id}`)
    .select("id")
    .maybeSingle();
  if (updateError) return json({ error: updateError.message }, 500);
  if (!data) return json({ error: "Push subscription not found." }, 404);
  await (supabase as any).from("notification_deliveries")
    .update({ status: "cancelled", last_error: "Subscription disabled", updated_at: new Date().toISOString() })
    .eq("subscription_id", subscriptionId)
    .in("status", ["queued", "processing"]);
  return json({ disabled: true });
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
