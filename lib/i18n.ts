import { DEFAULT_LOCALE, detectBrowserLocale, isAppLocale, needsEnglishFallback, normalizeLocale, type AppLocale } from "@/lib/locales";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, detectBrowserLocale, intlLocale, isAppLocale, localeDirection, normalizeLocale, pick, type AppLocale } from "@/lib/locales";

export const LOCALE_STORAGE_KEY = "openAbundanceLocale";

// Written by the onboarding language picker (lib/onboardingContent.ts).
const ONBOARDING_LOCALE_KEY = "openAbundanceOnboardingLocale";

export function detectPreferredLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(storedLocale)) return storedLocale;
    // No explicit app choice yet: continue in the language picked during onboarding (zh and hi have no app dictionary yet).
    const onboardingLocale = window.localStorage.getItem(ONBOARDING_LOCALE_KEY);
    if (isAppLocale(onboardingLocale)) return onboardingLocale;
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

/** One lazily loaded chunk per language. Register new dictionaries here. */
const MESSAGE_LOADERS: Record<AppLocale, () => Promise<{ default: MessageDictionary }>> = {
  en: () => import("@/lib/messages/en"),
  ru: () => import("@/lib/messages/ru"),
  es: () => import("@/lib/messages/es"),
  zh: () => import("@/lib/messages/zh"),
  hi: () => import("@/lib/messages/hi")
};

const dictionaries: Partial<Record<AppLocale, MessageDictionary>> = {};

export function areMessagesLoaded(locale: AppLocale): boolean {
  return Boolean(dictionaries[locale]);
}

/** Loads one language's dictionary (a separate chunk), so a visitor downloads only the language in use. */
export async function loadMessages(locale: AppLocale): Promise<void> {
  const wanted: AppLocale[] = needsEnglishFallback(locale) ? [locale, DEFAULT_LOCALE] : [locale];
  await Promise.all(
    wanted
      .filter((code) => !dictionaries[code])
      .map(async (code) => {
        dictionaries[code] = (await MESSAGE_LOADERS[code]()).default;
      })
  );
}

export type MessageKey = keyof EnglishMessages;

export function translate(locale: AppLocale, key: MessageKey, values?: Record<string, string | number>): string {
  // Fallback chain: selected language -> English -> the key itself.
  const template = dictionaries[locale]?.[key] ?? dictionaries.en?.[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}
