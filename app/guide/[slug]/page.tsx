import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide, guides } from "@/lib/guides";

const SITE_URL = "https://open-abundance.vercel.app";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return {};
  const path = `/guide/${guide.slug}`;
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: path },
    openGraph: { type: "article", title: guide.title, description: guide.description, url: path, locale: "ru_RU" },
    twitter: { card: "summary", title: guide.title, description: guide.description }
  };
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();

  const url = `${SITE_URL}/guide/${guide.slug}`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      inLanguage: "ru",
      datePublished: guide.updated,
      dateModified: guide.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "Open Abundance", url: SITE_URL },
      publisher: { "@type": "Organization", name: "Open Abundance", url: SITE_URL, logo: `${SITE_URL}/icons/twenty-levels-app-icon-512.png` }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer }
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Open Abundance", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Ответы", item: `${SITE_URL}/guide` },
        { "@type": "ListItem", position: 3, name: guide.title, item: url }
      ]
    }
  ];
  const related = guides.filter((item) => item.slug !== guide.slug).slice(0, 4);

  return (
    <main className="legal-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <article className="legal-document" lang="ru">
        <header className="legal-document-header">
          <Link className="legal-home-link" href="/">Open Abundance</Link>
          <Link className="legal-home-link" href="/guide">Все ответы</Link>
        </header>

        <div className="legal-document-title">
          <h1>{guide.title}</h1>
          <small>Обновлено: {guide.updated}</small>
        </div>

        <p className="legal-notice">{guide.answer}</p>

        <div className="legal-sections">
          {guide.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            </section>
          ))}
          <section>
            <h2>Частые вопросы</h2>
            {guide.faq.map((item) => (
              <div className="guide-faq-item" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </section>
        </div>

        <Link className="legal-primary-action" href="/">Открыть Open Abundance</Link>

        <footer className="legal-document-footer">
          <nav aria-label="Другие ответы">
            {related.map((item) => <Link href={`/guide/${item.slug}`} key={item.slug}>{item.title}</Link>)}
          </nav>
        </footer>
      </article>
    </main>
  );
}
