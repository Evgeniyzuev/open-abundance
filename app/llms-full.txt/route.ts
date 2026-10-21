import { guides, type Guide } from "@/lib/guides";
import { guidesEn } from "@/lib/guidesEn";
import { SITE_URL, guidePath } from "@/lib/guideLocales";

export const revalidate = 3600;

// All public answers as one plain-text file for AI assistants (the long companion to /llms.txt).
// Generated from the same source as the pages, so it cannot drift from them.
function render(guide: Guide, locale: "en" | "ru", labels: { faq: string }): string {
  const lines = [`## ${guide.title}`, `URL: ${SITE_URL}${guidePath(locale, guide.slug)}`, `Updated: ${guide.updated}`, "", guide.answer, ""];
  for (const section of guide.sections) {
    lines.push(`### ${section.title}`);
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph, "");
    for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`);
    if (section.bullets) lines.push("");
  }
  lines.push(`### ${labels.faq}`);
  for (const item of guide.faq) lines.push(`Q: ${item.question}`, `A: ${item.answer}`, "");
  return lines.join("\n");
}

export function GET() {
  const body = [
    "# Open Abundance: full text of public answers",
    "",
    "> Open Abundance is a free web app and open experiment in mutual help. Start here: " + SITE_URL + "/?utm_source=ai_assistant",
    "",
    "# English",
    "",
    ...guidesEn.map((guide) => render(guide, "en", { faq: "Frequently asked questions" })),
    "# Русский",
    "",
    ...guides.map((guide) => render(guide, "ru", { faq: "Частые вопросы" }))
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
