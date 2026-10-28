import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { telegramAccountEmail, telegramDisplayName, verifyTelegramInitData } from "../lib/telegramInitData.ts";

const token = "123456:TEST-token";
const now = 1_800_000_000;

function sign(fields, botToken = token) {
  const params = new URLSearchParams(fields);
  const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

const user = JSON.stringify({ id: 42, first_name: "Анна", last_name: "К", username: "anna", photo_url: "https://t.me/i/userpic/1.jpg", language_code: "ru" });
const good = sign({ auth_date: String(now - 60), query_id: "AAE", user, start_param: "ABCD1234" });

const result = verifyTelegramInitData(good, token, now);
assert.equal(result.user.id, 42);
assert.equal(result.user.username, "anna");
assert.equal(result.startParam, "ABCD1234");
assert.equal(telegramDisplayName(result.user), "Анна К");
assert.equal(telegramAccountEmail(42), "tg42@telegram.open-abundance.app");

// Wrong token, changed field, stale or future date, missing user: rejected.
assert.equal(verifyTelegramInitData(good, "999:other", now), null);
assert.equal(verifyTelegramInitData(good.replace("ABCD1234", "HACKED12"), token, now), null);
assert.equal(verifyTelegramInitData(sign({ auth_date: String(now - 2 * 86400), user }), token, now), null);
assert.equal(verifyTelegramInitData(sign({ auth_date: String(now + 3600), user }), token, now), null);
assert.equal(verifyTelegramInitData(sign({ auth_date: String(now) }), token, now), null);
assert.equal(verifyTelegramInitData("", token, now), null);
assert.equal(verifyTelegramInitData(good, "", now), null);

// A start param with odd characters is dropped, sign-in still works.
const odd = verifyTelegramInitData(sign({ auth_date: String(now), user, start_param: "a b<c>" }), token, now);
assert.equal(odd.startParam, null);

// Non-https photo is not kept.
const http = verifyTelegramInitData(sign({ auth_date: String(now), user: JSON.stringify({ id: 7, photo_url: "http://x/y.jpg" }) }), token, now);
assert.equal(http.user.photoUrl, null);

console.log("telegram init data contract ok");

const { telegramMiniAppLink } = await import("../lib/telegramMiniAppLink.ts");
assert.equal(telegramMiniAppLink("https://t.me/OpenAbundanceBot/app", "ABCD1234"), "https://t.me/OpenAbundanceBot/app?startapp=ABCD1234");
assert.equal(telegramMiniAppLink(undefined, "ABCD1234"), null);
assert.equal(telegramMiniAppLink("https://evil.example/app", "ABCD1234"), null);
assert.equal(telegramMiniAppLink("https://t.me/OpenAbundanceBot/app", "a b"), null);
console.log("telegram mini app link contract ok");

const { createTelegramLinkToken, readTelegramLinkToken, isTelegramOnlyEmail } = await import("../lib/telegramInitData.ts");
const userId = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const link = createTelegramLinkToken(userId, token, now);
assert.ok(link.startsWith("lnk_"));
assert.ok(link.length <= 64 && /^[A-Za-z0-9_-]+$/.test(link), "fits Telegram start_param");
assert.ok(link.length > 32, "longer than any referral code");
assert.equal(readTelegramLinkToken(link, token, now + 60), userId);
assert.equal(readTelegramLinkToken(link, token, now + 31 * 60), null, "expires after 30 minutes");
assert.equal(readTelegramLinkToken(link, "other", now), null);
assert.equal(readTelegramLinkToken(link.slice(0, -1) + (link.endsWith("A") ? "B" : "A"), token, now), null);
assert.equal(readTelegramLinkToken("ABCD1234", token, now), null);
assert.equal(createTelegramLinkToken("not-a-uuid", token, now), null);
assert.equal(isTelegramOnlyEmail("tg42@telegram.open-abundance.app"), true);
assert.equal(isTelegramOnlyEmail("anna@gmail.com"), false);
console.log("telegram link token contract ok");
