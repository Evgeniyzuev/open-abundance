import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/"]
    },
    sitemap: "https://open-abundance.vercel.app/sitemap.xml"
  };
}
