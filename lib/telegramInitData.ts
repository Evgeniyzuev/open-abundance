// Telegram Mini App sign-in: checks the initData string Telegram passes to the app.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from "node:crypto";

export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
// Accounts made from Telegram get this technical address; no mail is ever sent to it.
export const TELEGRAM_EMAIL_DOMAIN = "telegram.open-abundance.app";

export type TelegramUser = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
};

export type TelegramInitData = { user: TelegramUser; startParam: string | null; authDate: number };

/** Returns the signed data, or null when the signature, age or user is not valid. */
export function verifyTelegramInitData(initData: string, botToken: string, nowSeconds = Math.floor(Date.now() / 1000)): TelegramInitData | null {
  if (!initData || !botToken || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate > nowSeconds + 60 || nowSeconds - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) return null;

  const user = readUser(params.get("user"));
  if (!user) return null;
  const startParam = params.get("start_param");
  return { user, startParam: startParam && /^[A-Za-z0-9_-]{1,64}$/.test(startParam) ? startParam : null, authDate };
}

export function telegramAccountEmail(telegramId: number): string {
  return `tg${telegramId}@${TELEGRAM_EMAIL_DOMAIN}`;
}

export function telegramDisplayName(user: TelegramUser): string | null {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function readUser(raw: string | null): TelegramUser | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const id = Number(value.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const text = (key: string) => typeof value[key] === "string" && (value[key] as string).trim() ? (value[key] as string).trim().slice(0, 120) : null;
    const photo = text("photo_url");
    return {
      id,
      firstName: text("first_name"),
      lastName: text("last_name"),
      username: text("username"),
      photoUrl: photo && photo.startsWith("https://") ? photo : null,
      languageCode: text("language_code")
    };
  } catch {
    return null;
  }
}
