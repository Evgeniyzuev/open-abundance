// Messages from the Open Abundance bot to a person's Telegram. Pure message building plus one small sender, so the
// coordinator can reach people who live in the Mini App (web push does not exist there). No imports: tested by node.

export type TelegramNudgeCopy = { title: string; body: string; button?: string };

export type TelegramNudgeMessage = {
  text: string;
  buttonText: string;
  url: string;
  /** "url" opens a plain link (e.g. a t.me Mini App link); default "web_app" launches the site as a Mini App. */
  openAs?: "web_app" | "url";
  /** true when `text` is Telegram HTML (bold title); every other part of it must already be escaped. */
  html?: boolean;
};

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BUTTON_TEXT: Record<string, string> = { en: "Open", ru: "Открыть", es: "Abrir", zh: "打开", hi: "खोलें", ar: "فتح" };

/**
 * Text (bold title, then the body), button and Mini App link for one coordinator nudge, in the person's language when
 * the copy has it, else English.
 */
export function buildTelegramNudge(
  copy: { en: TelegramNudgeCopy } & Partial<Record<string, TelegramNudgeCopy>>,
  locale: string,
  deepLink: string,
  siteUrl: string
): TelegramNudgeMessage | null {
  if (!deepLink.startsWith("/") || deepLink.startsWith("//")) return null;
  const language = copy[locale] ? locale : "en";
  const chosen = copy[language] ?? copy.en;
  return {
    text: `<b>${escapeTelegramHtml(chosen.title)}</b>\n\n${escapeTelegramHtml(chosen.body)}`,
    buttonText: chosen.button || (BUTTON_TEXT[language] ?? BUTTON_TEXT.en),
    url: `${siteUrl.replace(/\/+$/, "")}${deepLink}`,
    html: true
  };
}

/**
 * Telegram copy of one push: bold title, the body and an "Open" button to the push's deep link (the app's home when it
 * has none or it is not a local path). Title and body are already in the person's language.
 */
export function buildTelegramNotification(
  push: { title: string | null; body: string | null; deepLink: string | null },
  locale: string,
  siteUrl: string
): TelegramNudgeMessage | null {
  const title = String(push.title ?? "").trim();
  const body = String(push.body ?? "").trim().slice(0, 3500);
  if (!title && !body) return null;
  const link = push.deepLink && push.deepLink.startsWith("/") && !push.deepLink.startsWith("//") ? push.deepLink : "/";
  const text = [title ? `<b>${escapeTelegramHtml(title)}</b>` : "", escapeTelegramHtml(body)].filter(Boolean).join("\n\n");
  return {
    text,
    buttonText: BUTTON_TEXT[locale] ?? BUTTON_TEXT.en,
    url: `${siteUrl.replace(/\/+$/, "")}${link}`,
    html: true
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
        ...(message.html ? { parse_mode: "HTML" } : {}),
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[message.openAs === "url" ? { text: message.buttonText, url: message.url } : { text: message.buttonText, web_app: { url: message.url } }]] }
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
