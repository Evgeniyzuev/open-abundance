import type { MetadataRoute } from "next";

const PRIVATE_PATHS = ["/api/", "/auth/"];

// Search engines and AI assistants (search, user-triggered fetches and training) may read every public page.
// Named explicitly so the policy is clear to each crawler; the wildcard rule covers everyone else.
const AI_AND_SEARCH_BOTS = [
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "YandexBot",
  "Baiduspider",
  "Applebot",
  "Applebot-Extended",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Meta-ExternalAgent",
  "Bytespider",
  "DuckAssistBot",
  "CCBot"
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_AND_SEARCH_BOTS, allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }
    ],
    sitemap: "https://open-abundance.vercel.app/sitemap.xml"
  };
}
