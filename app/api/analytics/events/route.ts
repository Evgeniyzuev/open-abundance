import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";

type EventBody = {
  anonymousId?: unknown;
  eventName?: unknown;
  properties?: unknown;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Analytics is not configured." }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => ({}))) as EventBody;
  const eventName = cleanEventName(body.eventName);
  const anonymousId = cleanText(body.anonymousId, 128);
  if (!eventName || !anonymousId) {
    return NextResponse.json({ error: "Invalid analytics event." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let userId: string | null = null;
  if (accessToken) {
    const { data } = await supabase.auth.getUser(accessToken);
    userId = data.user?.id ?? null;
  }

  await recordProductEvent({
    anonymousId,
    eventName,
    properties: cleanProperties(body.properties),
    source: "web",
    userId
  });

  return NextResponse.json({ accepted: true }, { status: 202, headers: NO_STORE_HEADERS });
}

function cleanEventName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[a-z][a-z0-9_]{1,63}$/.test(value) ? value : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanProperties(value: unknown): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const properties: Record<string, Json | undefined> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      properties[key.slice(0, 64)] = typeof entry === "string" ? entry.slice(0, 300) : entry;
    }
  }
  return properties;
}
