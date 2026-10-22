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

// One-time link "sign in to my existing account from Telegram": t.me/<bot>/<app>?startapp=<token>.
// The token is stateless: lnk_ + user id + expiry + HMAC, signed with the bot token, valid 30 minutes.
// It fits Telegram's start parameter (A-Z a-z 0-9 _ -, at most 64 characters) and is longer than any referral code.
export const TELEGRAM_LINK_PREFIX = "lnk_";
export const TELEGRAM_LINK_TTL_SECONDS = 30 * 60;

export function createTelegramLinkToken(userId: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  const id = userId.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(id) || !secret) return null;
  const body = `${Buffer.from(id, "hex").toString("base64url")}${(nowSeconds + TELEGRAM_LINK_TTL_SECONDS).toString(36)}`;
  return `${TELEGRAM_LINK_PREFIX}${body}${linkSignature(body, secret)}`;
}

/** The account id the link was made for, or null when the token is not ours, changed or expired. */
export function readTelegramLinkToken(token: string | null | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  if (!token || !secret || !token.startsWith(TELEGRAM_LINK_PREFIX)) return null;
  const rest = token.slice(TELEGRAM_LINK_PREFIX.length);
  const body = rest.slice(0, -SIGNATURE_LENGTH);
  const signature = rest.slice(-SIGNATURE_LENGTH);
  if (body.length <= 22 || signature.length !== SIGNATURE_LENGTH) return null;
  const expected = Buffer.from(linkSignature(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const expiresAt = parseInt(body.slice(22), 36);
  if (!Number.isFinite(expiresAt) || expiresAt < nowSeconds) return null;
  const hex = Buffer.from(body.slice(0, 22), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isTelegramOnlyEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${TELEGRAM_EMAIL_DOMAIN}`));
}

const SIGNATURE_LENGTH = 22;

function linkSignature(body: string, secret: string): string {
  return createHmac("sha256", `telegram-link:${secret}`).update(body).digest("base64url").slice(0, SIGNATURE_LENGTH);
}
