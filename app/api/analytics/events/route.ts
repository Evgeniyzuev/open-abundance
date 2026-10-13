import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { parseAnalyticsEvents } from "@/lib/analyticsBatch";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvents } from "@/lib/serverAnalytics";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Analytics is not configured." }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => ({}))) as { anonymousId?: unknown };
  const events = parseAnalyticsEvents(body);
  const anonymousId = cleanText(body.anonymousId, 128);
  if (events.length === 0 || !anonymousId) {
    return NextResponse.json({ error: "Invalid analytics event." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let userId: string | null = null;
  if (accessToken) {
    const { data } = await supabase.auth.getUser(accessToken);
    userId = data.user?.id ?? null;
  }

  // One auth check and one insert for the whole batch.
  await recordProductEvents(events.map((event) => ({
    anonymousId,
    eventName: event.eventName,
    properties: event.properties,
    source: "web",
    userId
  })));

  return NextResponse.json({ accepted: events.length }, { status: 202, headers: NO_STORE_HEADERS });
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}
