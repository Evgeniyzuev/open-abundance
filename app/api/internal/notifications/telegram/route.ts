import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/guideLocales";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { buildTelegramNotification, sendTelegramMessage } from "@/lib/telegramBot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const BATCH = 50;
const MAX_ATTEMPTS = 3;

type Copy = { delivery_id: string; telegram_id: number | null; locale: string | null; event_type: string; deep_link: string | null; title: string | null; body: string | null };

/**
 * POST /api/internal/notifications/telegram
 *
 * Called by pg_cron every minute while Telegram copies of pushes wait (supabase/migrations/20261025090000). Sends each
 * one through the Open Abundance bot. TELEGRAM_NOTIFICATIONS_ENABLED=0 switches it off (copies then expire after a day).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TON_SCANNER_SECRET?.trim();
  const provided = request.headers.get("x-ton-scanner-secret")?.trim() ?? "";
  if (!expected || !safeEqual(provided, expected)) return json({ error: "Unauthorized." }, 401);

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken || process.env.TELEGRAM_NOTIFICATIONS_ENABLED?.trim() === "0") return json({ skipped: true }, 200);

  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db.rpc("claim_telegram_notification_copies", { p_limit: BATCH });
  if (error) return json({ error: error.message }, 500);

  const summary = { claimed: 0, sent: 0, blocked: 0, failed: 0, cancelled: 0 };
  for (const copy of (data ?? []) as Copy[]) {
    summary.claimed += 1;
    const message = buildTelegramNotification({ title: copy.title, body: copy.body, deepLink: copy.deep_link }, copy.locale ?? "en", SITE_URL);
    if (!copy.telegram_id || !message) {
      summary.cancelled += 1;
      await finish(db, copy.delivery_id, { status: "cancelled", last_error: copy.telegram_id ? "Empty text" : "Telegram is no longer linked" });
      continue;
    }
    const result = await sendTelegramMessage(botToken, copy.telegram_id, message);
    if (result.ok) {
      summary.sent += 1;
      await finish(db, copy.delivery_id, { status: "sent", sent_at: new Date().toISOString(), last_error: null });
    } else if (result.blocked) {
      // The person never pressed Start in the bot or blocked it: retrying would not help.
      summary.blocked += 1;
      await finish(db, copy.delivery_id, { status: "blocked", last_error: result.error });
    } else {
      summary.failed += 1;
      const { data: row } = await db.from("telegram_notification_deliveries").select("attempts").eq("id", copy.delivery_id).maybeSingle();
      const retry = Number(row?.attempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;
      await finish(db, copy.delivery_id, { status: retry ? "queued" : "failed", claimed_at: null, last_error: result.error });
    }
  }
  return json(summary, 200);
}

async function finish(db: any, id: string, fields: Record<string, unknown>) {
  await db.from("telegram_notification_deliveries").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
