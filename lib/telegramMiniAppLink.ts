// t.me/<bot>/<app> link with a referral code as the start parameter, or null when no Mini App is set up.
// mode=compact: Telegram opens the app at half height instead of the whole screen.
export function telegramMiniAppLink(baseUrl: string | undefined, code: string): string | null {
  if (!baseUrl || !/^https:\/\/t\.me\/[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)?\/?$/.test(baseUrl.trim())) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return null;
  const url = new URL(baseUrl.trim());
  url.searchParams.set("startapp", code);
  url.searchParams.set("mode", "compact");
  return url.toString();
}

/** The bot's own chat (t.me/<bot>), where "Start" lets the bot write to the person; null when no Mini App is set up. */
export function telegramBotChatUrl(baseUrl: string | undefined): string | null {
  const match = /^https:\/\/t\.me\/([A-Za-z0-9_]+)/.exec(baseUrl?.trim() ?? "");
  return match ? `https://t.me/${match[1]}` : null;
}
