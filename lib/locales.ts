/**
 * Single source of truth for supported UI languages.
 * Adding a language = one entry here + one dictionary file + one loader in lib/i18n.ts.
 * English is the base language: any missing key, text or translation falls back to it.
 */
export const LOCALES = [
  // `intl`: BCP 47 tag for Intl formatting. `dir`: writing direction.
  // `complete`: the dictionary has every English key (enforced by `pnpm test:i18n`), so English need not be loaded as a fallback.
  { code: "en", nativeName: "English", intl: "en-US", dir: "ltr", complete: true },
  { code: "ru", nativeName: "Русский", intl: "ru-RU", dir: "ltr", complete: true },
  // Partial: only level 1 (interface). Everything else falls back to English.
  { code: "es", nativeName: "Español", intl: "es-419", dir: "ltr", complete: false }
] as const;

export type AppLocale = (typeof LOCALES)[number]["code"];
export type TextDirection = "ltr" | "rtl";

export const SUPPORTED_LOCALES: AppLocale[] = LOCALES.map((locale) => locale.code);
export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);
}

/** Accepts an exact code or a browser-style tag ("ru-RU" -> "ru"); anything else becomes English. */
export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const lower = value.trim().toLowerCase();
  if (isAppLocale(lower)) return lower;
  const base = lower.split(/[-_]/)[0];
  return isAppLocale(base) ? base : DEFAULT_LOCALE;
}

export function localeDirection(locale: AppLocale): TextDirection {
  return LOCALES.find((item) => item.code === locale)?.dir ?? "ltr";
}

export function intlLocale(locale: AppLocale): string {
  return LOCALES.find((item) => item.code === locale)?.intl ?? "en-US";
}

/** First supported language among the browser's preferences, otherwise English. */
export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const candidates = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    if (isAppLocale(base) && base !== DEFAULT_LOCALE) return base;
  }
  return DEFAULT_LOCALE;
}

/** Per-language values where English is required and every other language is optional. */
export type Localized<T> = { en: T } & Partial<Record<AppLocale, T>>;

/** Picks a per-language value, falling back to English when the language has none. */
export function pick<T>(locale: AppLocale, values: Localized<T>): T {
  return values[locale] ?? values.en;
}

/** Partial languages need the English dictionary loaded as the fallback. */
export function needsEnglishFallback(locale: AppLocale): boolean {
  return !(LOCALES.find((item) => item.code === locale)?.complete ?? false);
}
