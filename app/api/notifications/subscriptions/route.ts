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
