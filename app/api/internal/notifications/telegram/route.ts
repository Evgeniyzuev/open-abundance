import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { sendQueuedTelegramCopies, telegramCopiesBotToken } from "@/lib/telegramNotificationQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const BATCH = 50;

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

  const botToken = telegramCopiesBotToken();
  if (!botToken) return json({ skipped: true }, 200);

  const db = createServiceSupabaseClient() as any;
  try {
    return json(await sendQueuedTelegramCopies(db, botToken, BATCH), 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not claim copies." }, 500);
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
