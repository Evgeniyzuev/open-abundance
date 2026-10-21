// Language versions of the public answer pages. Russian lives at /guide, other languages at /<lang>/guide.
// Adding a language = one guide list file + one entry here + two thin route files under app/<lang>/guide.
import { guides, type Guide } from "@/lib/guides";
import { guidesEn } from "@/lib/guidesEn";
import type { AppLocale } from "@/lib/locales";

export const SITE_URL = "https://open-abundance.vercel.app";

/** Languages that have answer pages; a subset of the app languages. */
export type GuideLocale = Extract<AppLocale, "en" | "ru">;

export type GuideLabels = {
  indexTitle: string;
  indexIntro: string;
  allAnswers: string;
  updated: string;
  faq: string;
  related: string;
  start: string;
  startNote: string;
  ogLocale: string;
};

export const GUIDE_LABELS: Record<GuideLocale, GuideLabels> = {
  ru: {
    indexTitle: "Ответы",
    indexIntro: "Короткие ответы на частые вопросы о желаниях, привычках, одиночестве и о том, как устроен Open Abundance.",
    allAnswers: "Все ответы",
    updated: "Обновлено",
    faq: "Частые вопросы",
    related: "Другие ответы",
    start: "Открыть Open Abundance",
    startNote: "Бесплатно, без карты и подписки.",
    ogLocale: "ru_RU"
  },
  en: {
    indexTitle: "Answers",
    indexIntro: "Short, practical answers about goals, first clients, finding help and people, habits and how Open Abundance works. Written so that people and AI assistants can quote them.",
    allAnswers: "All answers",
    updated: "Updated",
    faq: "Frequently asked questions",
    related: "More answers",
    start: "Start free in Open Abundance",
    startNote: "Free, no card or subscription. You pick one goal and get the first small step today.",
    ogLocale: "en_US"
  }
};

export function guidesFor(locale: GuideLocale): Guide[] {
  return locale === "en" ? guidesEn : guides;
}

export function getLocalizedGuide(locale: GuideLocale, slug: string): Guide | undefined {
  return guidesFor(locale).find((guide) => guide.slug === slug);
}

export function guideIndexPath(locale: GuideLocale): string {
  return locale === "ru" ? "/guide" : `/${locale}/guide`;
}

export function guidePath(locale: GuideLocale, slug: string): string {
  return `${guideIndexPath(locale)}/${slug}`;
}

/** Onboarding link with attribution, so we can see which answers bring people who then take a first step. */
export function guideOnboardingPath(locale: GuideLocale, slug?: string): string {
  const params = new URLSearchParams({ utm_source: "answers", utm_medium: `guide_${locale}` });
  if (slug) params.set("utm_campaign", slug);
  return `/?${params.toString()}`;
}

/** hreflang map for one answer: its own language plus every translation that points to the same Russian page. */
export function guideLanguageAlternates(locale: GuideLocale, guide: Guide): Record<string, string> {
  const ruSlug = locale === "ru" ? guide.slug : guide.ruSlug;
  const alternates: Record<string, string> = { [locale]: guidePath(locale, guide.slug) };
  if (!ruSlug) return alternates;
  alternates.ru = guidePath("ru", ruSlug);
  const en = guidesEn.find((item) => item.ruSlug === ruSlug);
  if (en) alternates.en = guidePath("en", en.slug);
  return alternates;
}
