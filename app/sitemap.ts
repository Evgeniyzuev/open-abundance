import type { MetadataRoute } from "next";
import { SITE_URL, guideIndexPath, guidePath, guidesFor, type GuideLocale } from "@/lib/guideLocales";

const GUIDE_LOCALES: GuideLocale[] = ["en", "ru"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1
    },
    ...GUIDE_LOCALES.flatMap((locale) => [
      {
        url: `${SITE_URL}${guideIndexPath(locale)}`,
        changeFrequency: "weekly" as const,
        priority: 0.8
      },
      ...guidesFor(locale).map((guide) => ({
        url: `${SITE_URL}${guidePath(locale, guide.slug)}`,
        lastModified: guide.updated,
        changeFrequency: "monthly" as const,
        priority: 0.7
      }))
    ])
  ];
}
