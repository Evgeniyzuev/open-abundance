import { SITE_URL } from "@/lib/guideLocales";
import { buildTelegramNotification, sendTelegramMessage } from "@/lib/telegramBot";

const MAX_ATTEMPTS = 3;

type Copy = { delivery_id: string; telegram_id: number | null; locale: string | null; event_type: string; deep_link: string | null; title: string | null; body: string | null };
export type TelegramQueueSummary = { claimed: number; sent: number; blocked: number; failed: number; cancelled: number };

/** The bot token when Telegram copies of pushes may be sent, else null (TELEGRAM_NOTIFICATIONS_ENABLED=0 switches them off). */
export function telegramCopiesBotToken(): string | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken || process.env.TELEGRAM_NOTIFICATIONS_ENABLED?.trim() === "0") return null;
  return botToken;
}

/**
 * Claims up to `limit` queued Telegram copies of pushes (supabase/migrations/20261025090000) and sends each one through
 * the Open Abundance bot. Used by the per-minute queue and, for a credited top-up, right away.
 */
export async function sendQueuedTelegramCopies(db: any, botToken: string, limit: number): Promise<TelegramQueueSummary> {
  const { data, error } = await db.rpc("claim_telegram_notification_copies", { p_limit: limit });
  if (error) throw new Error(error.message);

  const summary: TelegramQueueSummary = { claimed: 0, sent: 0, blocked: 0, failed: 0, cancelled: 0 };
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
  return summary;
}

async function finish(db: any, id: string, fields: Record<string, unknown>) {
  await db.from("telegram_notification_deliveries").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
}
