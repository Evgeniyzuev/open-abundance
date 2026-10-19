import type { Metadata } from "next";
import Link from "next/link";
import { guides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Ответы: желания, привычки, единомышленники",
  description: "Короткие ответы на частые вопросы: как найти единомышленников, что делать, если одиноко, как превратить желание в план и как работает Open Abundance.",
  alternates: { canonical: "/guide" }
};

export default function GuideIndexPage() {
  return (
    <main className="legal-page">
      <article className="legal-document" lang="ru">
        <header className="legal-document-header">
          <Link className="legal-home-link" href="/">Open Abundance</Link>
        </header>

        <div className="legal-document-title">
          <h1>Ответы</h1>
          <p>Короткие ответы на частые вопросы о желаниях, привычках, одиночестве и о том, как устроен Open Abundance.</p>
        </div>

        <div className="legal-sections">
          {guides.map((guide) => (
            <section key={guide.slug}>
              <h2><Link href={`/guide/${guide.slug}`}>{guide.title}</Link></h2>
              <p>{guide.description}</p>
            </section>
          ))}
        </div>

        <Link className="legal-primary-action" href="/">Открыть Open Abundance</Link>
      </article>
    </main>
  );
}
