import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { normalizeLocale, translate, type MessageKey } from "@/lib/i18n";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);

    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
    const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 30;
    const cursor = request.nextUrl.searchParams.get("before");
    let query = (supabase as any)
      .from("notification_recipients")
      .select("id,read_at,created_at,event:notification_events!inner(id,event_type,category,source_type,source_id,title,body,deep_link,metadata,created_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt("created_at", cursor);

    const [{ data: rows, error: rowsError }, { data: unreadCount, error: countError }, { data: preferences, error: preferenceError }] = await Promise.all([
      query,
      (supabase as any).rpc("notification_unread_count", { p_user_id: user.id }),
      (supabase as any)
        .from("notification_preferences")
        .select("category,in_app_enabled")
        .eq("user_id", user.id)
    ]);
    if (rowsError) return json({ error: rowsError.message }, 500);
    if (countError) return json({ error: countError.message }, 500);
    if (preferenceError) return json({ error: preferenceError.message }, 500);

    const disabledCategories = new Set((preferences ?? []).filter((item: any) => item.in_app_enabled === false).map((item: any) => item.category));
    const visibleRows = (rows ?? []).filter((row: any) => !disabledCategories.has((Array.isArray(row.event) ? row.event[0] : row.event)?.category));
    const hasMore = visibleRows.length > limit || (rows?.length ?? 0) > limit;
    const page = visibleRows.slice(0, limit).map((row: any) => {
      const event = Array.isArray(row.event) ? row.event[0] : row.event;
      const localized = notificationCopy(event?.event_type, locale);
      return { id: row.id, readAt: row.read_at, createdAt: row.created_at, ...event, ...(localized ? { title: localized.title, body: localized.body } : {}) };
    });
    return json({ notifications: page, unreadCount: Number(unreadCount ?? 0), nextCursor: hasMore ? page.at(-1)?.createdAt ?? null : null });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to load notifications." }, 500);
  }
}

function notificationCopy(eventType: string | undefined, locale: "ru" | "en") {
  const key = eventType?.startsWith("wallet.") ? "wallet"
    : eventType === "rewards.daily_core_accrual" ? "dailyCore"
      : eventType === "rewards.team_core_growth" ? "teamReward"
        : eventType === "rewards.challenge_completed" ? "challenge"
          : eventType?.startsWith("confirmations.") ? "confirmation"
            : eventType?.startsWith("team.task.") ? "teamTask"
              : eventType?.startsWith("p2p.order.") && (eventType.includes("dispute") || eventType.includes("resolution")) ? "p2pDispute"
                : eventType?.startsWith("p2p.order.") ? "p2pDeal"
                  : null;
  if (!key) return null;
  return {
    title: translate(locale, `notifications.event.${key}.title` as MessageKey),
    body: translate(locale, `notifications.event.${key}.body` as MessageKey)
  };
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    const body = await request.json().catch(() => ({})) as { ids?: unknown; all?: unknown };
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))).slice(0, 100)
      : [];
    if (!body.all && ids.length === 0) return json({ error: "Notification IDs are required." }, 400);

    let update = (supabase as any)
      .from("notification_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (!body.all) update = update.in("id", ids);
    const { error: updateError } = await update;
    if (updateError) return json({ error: updateError.message }, 500);
    return json({ updated: true });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to update notifications." }, 500);
  }
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
