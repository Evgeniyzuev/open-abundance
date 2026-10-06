import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

const CATEGORIES = ["idea", "problem", "confusing", "other"] as const;
type FeedbackCategory = (typeof CATEGORIES)[number];

const DAILY_LIMIT = 10;

/**
 * POST /api/feedback
 *
 * Stores one private feedback message. The text is kept only in
 * `user_feedback`; the product event carries the category and screen, never
 * the message.
 */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const category = CATEGORIES.find((item) => item === body?.category) as FeedbackCategory | undefined;
  if (message.length < 3 || message.length > 2000 || !category) {
    return NextResponse.json({ error: "Write a short message and choose a type." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const screen = typeof body?.screen === "string" ? body.screen.trim().slice(0, 80) || null : null;
  const locale = body?.locale === "ru" || body?.locale === "en" ? body.locale : null;

  const db = supabase as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("user_feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countError) return NextResponse.json({ error: "Could not save feedback." }, { status: 500, headers: NO_STORE_HEADERS });
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: "Daily feedback limit reached. Thank you." }, { status: 429, headers: NO_STORE_HEADERS });
  }

  const { error: insertError } = await db
    .from("user_feedback")
    .insert({ user_id: user.id, category, message, screen, locale });
  if (insertError) return NextResponse.json({ error: "Could not save feedback." }, { status: 500, headers: NO_STORE_HEADERS });

  await recordProductEvent({
    entityType: "feedback",
    eventName: "feedback_submitted",
    properties: { category, screen },
    source: "server",
    userId: user.id
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
