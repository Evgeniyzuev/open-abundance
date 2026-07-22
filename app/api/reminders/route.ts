import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SubscriptionInput = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

type ScheduleBody = {
  subscription?: SubscriptionInput;
  guestId?: string;
  clientReminderId?: string;
  kind?: "action" | "today_daily";
  locale?: string;
  dueAt?: string;
  recurring?: boolean;
  localTime?: string;
  timezone?: string;
  deepLink?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as ScheduleBody | null;
  const validated = validateBody(body);
  if (!validated) return json({ error: "Invalid reminder request." }, 400);

  try {
    const supabase = createAdminClient();
    const ownerKey = await getOwnerKey(request, validated.guestId, supabase);
    const { data: subscription, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .upsert({
        owner_key: ownerKey,
        endpoint: validated.subscription.endpoint,
        p256dh: validated.subscription.keys.p256dh,
        auth: validated.subscription.keys.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        enabled: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "endpoint" })
      .select("id")
      .single();
    if (subscriptionError || !subscription) throw subscriptionError ?? new Error("Subscription was not stored.");

    const { error: jobError } = await supabase.from("reminder_jobs").upsert({
      subscription_id: subscription.id,
      client_reminder_id: validated.clientReminderId,
      kind: validated.kind,
      locale: validated.locale,
      due_at: validated.dueAt,
      recurring: validated.recurring,
      local_time: validated.recurring ? validated.localTime : null,
      timezone: validated.timezone,
      deep_link: validated.deepLink,
      status: "scheduled",
      attempts: 0,
      last_error: null,
      updated_at: new Date().toISOString()
    }, { onConflict: "subscription_id,client_reminder_id" });
    if (jobError) throw jobError;
    return json({ scheduled: true });
  } catch (error) {
    console.warn("Push reminder could not be scheduled.");
    return json({ error: error instanceof Error ? error.message : "Reminder scheduling failed." }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as Pick<ScheduleBody, "subscription" | "clientReminderId"> | null;
  const endpoint = cleanEndpoint(body?.subscription?.endpoint);
  const clientReminderId = cleanToken(body?.clientReminderId, 160);
  if (!endpoint || !clientReminderId) return json({ error: "Invalid reminder cancellation." }, 400);

  try {
    const supabase = createAdminClient();
    const { data: subscription } = await supabase.from("push_subscriptions").select("id").eq("endpoint", endpoint).maybeSingle();
    if (subscription) {
      await supabase.from("reminder_jobs")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("subscription_id", subscription.id)
        .eq("client_reminder_id", clientReminderId);
    }
    return json({ cancelled: true });
  } catch {
    return json({ error: "Reminder cancellation failed." }, 500);
  }
}

function validateBody(body: ScheduleBody | null) {
  const endpoint = cleanEndpoint(body?.subscription?.endpoint);
  const p256dh = cleanToken(body?.subscription?.keys?.p256dh, 500);
  const auth = cleanToken(body?.subscription?.keys?.auth, 500);
  const guestId = cleanToken(body?.guestId, 160);
  const clientReminderId = cleanToken(body?.clientReminderId, 160);
  const kind = body?.kind === "today_daily" ? "today_daily" : body?.kind === "action" ? "action" : null;
  const locale = body?.locale === "ru" ? "ru" : "en";
  const dueDate = body?.dueAt ? new Date(body.dueAt) : null;
  const recurring = Boolean(body?.recurring);
  const localTime = recurring && /^([01]\d|2[0-3]):[0-5]\d$/.test(body?.localTime ?? "") ? body?.localTime : null;
  const timezone = cleanTimezone(body?.timezone);
  const deepLink = cleanDeepLink(body?.deepLink);
  if (!endpoint || !p256dh || !auth || !guestId || !clientReminderId || !kind || !dueDate || Number.isNaN(dueDate.getTime()) || !timezone || !deepLink) return null;
  if (recurring && !localTime) return null;
  return {
    subscription: { endpoint, keys: { p256dh, auth } },
    guestId,
    clientReminderId,
    kind,
    locale,
    dueAt: dueDate.toISOString(),
    recurring,
    localTime,
    timezone,
    deepLink
  };
}

async function getOwnerKey(request: NextRequest, guestId: string, supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (accessToken) {
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (user) return `user:${user.id}`;
  }
  return `guest:${createHash("sha256").update(guestId).digest("hex")}`;
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function cleanToken(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function cleanTimezone(value: unknown): string | null {
  const timezone = cleanToken(value, 100);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return null;
  }
}

function cleanDeepLink(value: unknown): string | null {
  const link = cleanToken(value, 500);
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

function json(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store"
    }
  });
}
