// Automatic check of marketplace listing text (no imports, tested directly by node).
// A flagged listing is not blocked: it stays visible inside the app and is hidden from guests until an operator
// reviews it. The rules are cheap and deliberately broad; false positives cost only a short wait for the seller.

export type ListingFlag = "contacts" | "external_link" | "money_promise" | "prohibited" | "shouting" | "duplicate";

export const LISTING_FLAGS: readonly ListingFlag[] = ["contacts", "external_link", "money_promise", "prohibited", "shouting", "duplicate"];

/** New accounts may open only a few listings per day; older accounts are limited by Core level only. */
export const NEW_ACCOUNT_DAYS = 7;
export const NEW_ACCOUNT_DAILY_LISTINGS = 3;

// Moving the deal outside the app is the most common scam pattern, so phones, e-mails, handles and messengers are flagged.
const PHONE = /(?:\+|\b)\d(?:[\s\-().]*\d){8,}/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const HANDLE = /(?:^|[\s(])@[a-z0-9_]{4,}/i;
const MESSENGER = /(?:telegram|телеграм|телеграмм|телега|whats\s?app|ватсап|вацап|вотсап|viber|вайбер|signal|wechat|skype|скайп|discord|дискорд)/i;
const LINK = /(?:https?:\/\/|www\.|t\.me\/|wa\.me\/|\b[a-z0-9-]{2,}\.(?:com|ru|net|org|io|me|info|biz|xyz|shop|online|site|app|link|top|su)\b|[а-я0-9-]{2,}\.рф)/i;

const MONEY_PROMISE = [
  /гарантирован\p{L}*\s+(?:доход|заработ|прибыл)/iu,
  /пассивн\p{L}*\s+доход/iu,
  /удво\p{L}*\s+(?:деньг|депозит|вклад|сумм)/iu,
  /(?:доход|заработ\p{L}*|прибыль)\s+без\s+(?:вложений|усилий)/iu,
  /\d+\s*%\s*(?:в|за)\s*(?:день|сутки|неделю)/iu,
  /guaranteed\s+(?:income|return|profit|earnings)/i,
  /passive\s+income/i,
  /double\s+your\s+(?:money|deposit|investment)/i,
  /risk[\s-]?free\s+(?:income|profit|investment)/i,
  /\d+\s*%\s*(?:a|per)\s*(?:day|week)/i
];

const PROHIBITED = [
  /наркот|закладк|мефедрон|кокаин|героин|спайс|марихуан|гашиш/iu,
  /оружи|пистолет|взрывчат/iu,
  /казино|ставк\p{L}*\s+на\s+спорт|букмекер/iu,
  /эскорт|интим\s*услуг|секс\s*услуг/iu,
  /поддельн|фальшив|купить\s+(?:диплом|паспорт|права)|продам\s+(?:аккаунт|базу)/iu,
  /\b(?:drugs?|cocaine|heroin|meth|weed)\b/i,
  /\b(?:guns?|firearms?|ammo|explosives?)\b/i,
  /\b(?:casino|betting|escort)\b/i,
  /\b(?:fake|forged)\s+(?:id|passport|diploma|documents?)\b/i
];

export type ListingText = { title: string; description?: string | null; category?: string | null };

export function checkListingText(listing: ListingText): ListingFlag[] {
  const text = [listing.title, listing.description ?? "", listing.category ?? ""].join("\n");
  const flags = new Set<ListingFlag>();
  if (PHONE.test(text) || EMAIL.test(text) || HANDLE.test(text) || MESSENGER.test(text)) flags.add("contacts");
  if (LINK.test(text.replace(EMAIL, " "))) flags.add("external_link");
  if (MONEY_PROMISE.some((pattern) => pattern.test(text))) flags.add("money_promise");
  if (PROHIBITED.some((pattern) => pattern.test(text))) flags.add("prohibited");
  if (isShouting(listing.title)) flags.add("shouting");
  return LISTING_FLAGS.filter((flag) => flags.has(flag));
}

/** Normalised text for duplicate detection: case, spacing and punctuation do not matter. */
export function listingFingerprint(listing: ListingText): string {
  return [listing.title, listing.description ?? ""].join(" ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isShouting(title: string): boolean {
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length < 10) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.7;
}
