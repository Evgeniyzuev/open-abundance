import { depositCreditedCopy } from "@/lib/cryptoPayLinks";
import { sendQueuedTelegramCopies, telegramCopiesBotToken } from "@/lib/telegramNotificationQueue";

/**
 * "Credited $X" as a push and a Telegram copy, once per deposit (the idempotency key). The Telegram copy is sent right
 * away instead of waiting for the per-minute queue, so it arrives seconds after the money is credited.
 */
export async function notifyDepositCredited(db: any, input: { userId: string; sourceType: string; sourceId: string; usdAmount: number }) {
  const copy = depositCreditedCopy(input.usdAmount);
  const { data: eventId, error } = await db.rpc("create_notification_event_raw", {
    p_event_type: "wallet.deposit_credited",
    p_category: "wallet",
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_title: copy.en.title,
    p_body: copy.en.body,
    p_deep_link: "/?view=wallet.wallet",
    p_recipient_user_ids: [input.userId],
    p_idempotency_key: `deposit-credited:${input.sourceId}`,
    p_metadata: { copy, sourceType: input.sourceType },
    p_push: true
  });
  if (error || !eventId) return;
  const botToken = telegramCopiesBotToken();
  if (botToken) await sendQueuedTelegramCopies(db, botToken, 10);
}

/** Same, never throwing: a missed message is not worth failing a settlement for. */
export async function notifyDepositCreditedSafely(db: any, input: { userId: string | null | undefined; sourceType: string; sourceId: string; usdAmount: unknown }) {
  const usd = Number(input.usdAmount);
  if (!input.userId || !Number.isFinite(usd) || usd <= 0) return;
  try { await notifyDepositCredited(db, { userId: input.userId, sourceType: input.sourceType, sourceId: input.sourceId, usdAmount: usd }); } catch { /* see above */ }
}
