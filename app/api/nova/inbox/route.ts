import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/nova/inbox — the signed-in person's undelivered messages from Nova, oldest first (?peek=1: only the count).
 * POST /api/nova/inbox { ids } — marks them delivered once the chat saved them on the device.
 * Delivered messages are deleted on the server a day later (cleanup_nova_inbox).
 */
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const db = createServiceSupabaseClient() as any;
  // ?peek=1: only how many are waiting, for the unread dot on Nova's tab; nothing is marked delivered.
  if (request.nextUrl.searchParams.get("peek") === "1") {
    const { count, error: countError } = await db
      .from("nova_inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("delivered_at", null)
      .gt("expires_at", new Date().toISOString());
    return json({ count: countError ? 0 : count ?? 0 }, 200);
  }
  const { data, error: readError } = await db
    .from("nova_inbox_messages")
    .select("id,body,created_at")
    .eq("user_id", user.id)
    .is("delivered_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(5);
  // Before the migration is applied the inbox is simply empty.
  if (readError) return json({ messages: [] }, 200);
  return json({ messages: (data ?? []).map((row: any) => ({ id: row.id, body: row.body, createdAt: row.created_at })) }, 200);
}

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const payload = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20) : [];
  if (ids.length === 0) return json({ delivered: 0 }, 200);
  const db = createServiceSupabaseClient() as any;
  const { data, error: updateError } = await db
    .from("nova_inbox_messages")
    .update({ delivered_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("id", ids)
    .is("delivered_at", null)
    .select("id");
  if (updateError) return json({ error: updateError.message }, 500);
  return json({ delivered: data?.length ?? 0 }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
