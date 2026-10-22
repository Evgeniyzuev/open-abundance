// t.me/<bot>/<app> link with a referral code as the start parameter, or null when no Mini App is set up.
export function telegramMiniAppLink(baseUrl: string | undefined, code: string): string | null {
  if (!baseUrl || !/^https:\/\/t\.me\/[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)?\/?$/.test(baseUrl.trim())) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return null;
  const url = new URL(baseUrl.trim());
  url.searchParams.set("startapp", code);
  return url.toString();
}
