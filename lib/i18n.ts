export type AppLocale = "ru" | "en";

export const SUPPORTED_LOCALES: AppLocale[] = ["ru", "en"];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_STORAGE_KEY = "openAbundanceLocale";

export function normalizeLocale(value: unknown): AppLocale {
  return value === "ru" ? "ru" : "en";
}

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const candidates = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  return candidates.some((value) => value.toLowerCase().startsWith("ru")) ? "ru" : "en";
}

export function detectPreferredLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (storedLocale === "ru" || storedLocale === "en") return storedLocale;
  } catch {
    // Browser language remains a safe fallback when storage is unavailable.
  }

  return detectBrowserLocale();
}

export function storeLocalePreference(locale: AppLocale): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, normalizeLocale(locale));
  } catch {
    // The in-memory locale still works when storage is unavailable.
  }
}

type MessageDictionary = Record<string, string>;
type EnglishMessages = typeof import("@/lib/messages/en").default;

const dictionaries: Partial<Record<AppLocale, MessageDictionary>> = {};

export function areMessagesLoaded(locale: AppLocale): boolean {
  return Boolean(dictionaries[locale]);
}

/** Loads one language's dictionary (a separate chunk), so a visitor downloads only the language in use. */
export async function loadMessages(locale: AppLocale): Promise<void> {
  if (dictionaries[locale]) return;
  const module = locale === "ru" ? await import("@/lib/messages/ru") : await import("@/lib/messages/en");
  dictionaries[locale] = module.default;
}

export type MessageKey = keyof EnglishMessages;

export function translate(locale: AppLocale, key: MessageKey, values?: Record<string, string | number>): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries.en?.[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}
