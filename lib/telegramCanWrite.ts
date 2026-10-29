/**
 * Whether the Telegram bot can write to this account: a linked Telegram account that pressed Start (or allowed the
 * bot in the Mini App). Telegram has no read-only check, so a "typing" chat action is sent: it fails the same way a
 * message would. Null when the bot is not configured or no Telegram account is linked.
 */
export async function telegramBotCanWrite(db: any, userId: string): Promise<{ linked: boolean; canWrite: boolean } | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return null;
  const { data: account } = await db.from("telegram_accounts").select("telegram_id").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!account?.telegram_id) return { linked: false, canWrite: false };
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: account.telegram_id, action: "typing" })
    });
    return { linked: true, canWrite: response.ok };
  } catch {
    return { linked: true, canWrite: false };
  }
}
