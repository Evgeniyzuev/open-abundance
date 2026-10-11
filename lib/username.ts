/**
 * Nickname rules and generation. Pure, no imports, so the same code is covered by a deterministic
 * Node test (`pnpm test:username`) and mirrored by the database constraints.
 *
 * A nickname is public. It uses only a-z and 0-9, starts with a letter and has 5-24 characters.
 * It is stored in lower case. It is generated from a person's name and never from an email.
 */

export const USERNAME_MIN = 5;
export const USERNAME_MAX = 24;
export const USERNAME_PATTERN = /^[a-z][a-z0-9]{4,23}$/;
export const USERNAME_BASE_MAX = 16;

/** Names that nobody may take. The database holds the same list (`reserved_usernames`). */
export const RESERVED_USERNAMES: readonly string[] = [
  "admin", "administrator", "support", "helpdesk", "official", "openabundance", "abundance", "abundancesystem",
  "nova", "system", "wallet", "market", "marketplace", "teams", "api", "moderator", "staff", "security",
  "billing", "terms", "privacy", "contact", "login", "logout", "signin", "signup", "settings", "profile",
  "profiles", "users", "people", "feed", "blog", "posts", "challenges", "wishes", "payments", "transfer",
  "deposit", "withdraw", "founder", "owner", "operator", "coordinator", "treasury", "official", "oasystem",
  "undefined", "anonymous", "everyone", "unknown", "nobody", "invite", "referral", "reflection"
];

const RESERVED = new Set(RESERVED_USERNAMES);

export type UsernameProblem = "too_short" | "too_long" | "bad_chars" | "bad_start" | "reserved";
export type UsernameCheck = { ok: true; value: string } | { ok: false; reason: UsernameProblem };

/** Trim, lower-case and drop a leading "@" so "@Ivan4821" and "ivan4821" are the same. */
export function normalizeUsernameInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function validateUsername(input: unknown): UsernameCheck {
  const value = normalizeUsernameInput(input);
  if (!/^[a-z0-9]*$/.test(value)) return { ok: false, reason: "bad_chars" };
  if (value.length < USERNAME_MIN) return { ok: false, reason: "too_short" };
  if (value.length > USERNAME_MAX) return { ok: false, reason: "too_long" };
  if (!/^[a-z]/.test(value)) return { ok: false, reason: "bad_start" };
  if (RESERVED.has(value)) return { ok: false, reason: "reserved" };
  return { ok: true, value };
}

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g"
};

/** Latin letters and digits only: Cyrillic is transliterated, accents are stripped, the rest is dropped. */
export function transliterate(text: string): string {
  let result = "";
  for (const character of text.toLowerCase().normalize("NFKD")) {
    if (/[a-z0-9]/.test(character)) result += character;
    else if (CYRILLIC[character] !== undefined) result += CYRILLIC[character];
  }
  return result;
}

export type UsernameSource = { firstName?: string | null; lastName?: string | null; displayName?: string | null };

/**
 * The readable part of a generated nickname, or "" when the person's data gives nothing usable.
 * Anything that contains "@" is ignored on purpose: an email must never become public, not even
 * its local part.
 */
export function usernameBase(source: UsernameSource): string {
  const parts = [source.firstName, source.lastName].filter((part): part is string => typeof part === "string" && part.trim().length > 0 && !part.includes("@"));
  const joined = parts.join("");
  const fallback = typeof source.displayName === "string" && !source.displayName.includes("@") ? source.displayName : "";
  const base = transliterate(joined || fallback).replace(/^[0-9]+/, "");
  return base.slice(0, USERNAME_BASE_MAX);
}

/**
 * Candidate nicknames in order of preference: the plain base when it is long enough, then the base
 * with 2, 3 and 4 random digits. `random` is injectable so the order is testable.
 */
export function usernameCandidates(base: string, random: () => number = Math.random, perLength = 4): string[] {
  const root = base.length > 0 ? base : "user";
  const seen = new Set<string>();
  const candidates: string[] = [];
  const add = (value: string) => {
    const check = validateUsername(value);
    if (check.ok && !seen.has(check.value)) {
      seen.add(check.value);
      candidates.push(check.value);
    }
  };

  add(root);
  for (const digits of [2, 3, 4]) {
    for (let attempt = 0; attempt < perLength; attempt += 1) {
      const suffix = Array.from({ length: digits }, () => Math.floor(random() * 10)).join("");
      add(root.slice(0, USERNAME_MAX - digits) + suffix);
    }
  }
  return candidates;
}

/** True when a name, as typed by a person, looks like an email and must not be shown. */
export function looksLikeEmail(value: unknown): boolean {
  return typeof value === "string" && value.includes("@");
}

/**
 * A "look-alike" key: two nicknames with the same skeleton are easy to confuse by eye
 * (`0leg` / `oleg`, `ann1` / `annl`). The database computes the same key (`username_skeleton`) and
 * refuses a nickname whose skeleton already belongs to someone else.
 */
export function usernameSkeleton(value: string): string {
  return value
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[01i5382]/g, (char) => ({ "0": "o", "1": "l", i: "l", "5": "s", "3": "e", "8": "b", "2": "z" })[char as "0"] ?? char);
}
