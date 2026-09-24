import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://open-abundance.vercel.app/",
      changeFrequency: "weekly",
      priority: 1
    }
  ];
}
