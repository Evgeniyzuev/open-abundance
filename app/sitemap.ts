import type { MetadataRoute } from "next";
import { SITE_URL, guideIndexPath, guidePath, guidesFor, type GuideLocale } from "@/lib/guideLocales";
import { publicListingPath } from "@/lib/marketplaceGuestVisibility";
import { loadPublicListings } from "@/lib/marketplacePublic";

const GUIDE_LOCALES: GuideLocale[] = ["en", "ru"];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Only listings that pass the quality bar (lib/marketplaceGuestVisibility.ts) are offered to search engines.
  const listings = (await loadPublicListings()).filter((listing) => listing.indexable);
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
    ]),
    ...listings.map((listing) => ({
      url: `${SITE_URL}${publicListingPath(listing.id)}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5
    }))
  ];
}
