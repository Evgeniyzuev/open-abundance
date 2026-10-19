import type { MetadataRoute } from "next";
import { guides } from "@/lib/guides";

const SITE_URL = "https://open-abundance.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${SITE_URL}/guide`,
      changeFrequency: "weekly",
      priority: 0.8
    },
    ...guides.map((guide) => ({
      url: `${SITE_URL}/guide/${guide.slug}`,
      lastModified: guide.updated,
      changeFrequency: "monthly" as const,
      priority: 0.7
    }))
  ];
}
