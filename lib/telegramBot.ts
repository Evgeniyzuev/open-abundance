// Messages from the Open Abundance bot to a person's Telegram. Pure message building plus one small sender, so the
// coordinator can reach people who live in the Mini App (web push does not exist there). No imports: tested by node.

export type TelegramNudgeCopy = { title: string; body: string };

export type TelegramNudgeMessage = {
  text: string;
  buttonText: string;
  url: string;
};

const BUTTON_TEXT = { ru: "Открыть", en: "Open" } as const;

/** Text, button and Mini App link for one coordinator nudge. Russian when the person's language is Russian, else English. */
export function buildTelegramNudge(
  copy: { ru?: TelegramNudgeCopy; en: TelegramNudgeCopy },
  locale: string,
  deepLink: string,
  siteUrl: string
): TelegramNudgeMessage | null {
  if (!deepLink.startsWith("/") || deepLink.startsWith("//")) return null;
  const language = locale === "ru" && copy.ru ? "ru" : "en";
  const chosen = language === "ru" ? copy.ru! : copy.en;
  return {
    text: `${chosen.title}\n\n${chosen.body}`,
    buttonText: BUTTON_TEXT[language],
    url: `${siteUrl.replace(/\/+$/, "")}${deepLink}`
  };
}

export type TelegramSendResult = { ok: true } | { ok: false; blocked: boolean; error: string };

/**
 * Sends one message with an "Open" button that launches the Mini App at `url`. `blocked` is true when Telegram refuses
 * because the person never started the bot or blocked it: that is normal and not an error to retry.
 */
export async function sendTelegramMessage(botToken: string, chatId: number | string, message: TelegramNudgeMessage): Promise<TelegramSendResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.text,
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: message.buttonText, web_app: { url: message.url } }]] }
      })
    });
    if (response.ok) return { ok: true };
    const payload = await response.json().catch(() => ({})) as { description?: string };
    const description = String(payload.description ?? response.status);
    return { ok: false, blocked: response.status === 403 || /chat not found|bot was blocked|user is deactivated/i.test(description), error: description };
  } catch (sendError) {
    return { ok: false, blocked: false, error: sendError instanceof Error ? sendError.message : "Telegram request failed." };
  }
}
