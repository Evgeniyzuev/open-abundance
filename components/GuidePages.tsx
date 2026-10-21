import type { Metadata } from "next";
import Link from "next/link";
import type { Guide } from "@/lib/guides";
import {
  GUIDE_LABELS,
  SITE_URL,
  guideIndexPath,
  guideLanguageAlternates,
  guideOnboardingPath,
  guidePath,
  guidesFor,
  type GuideLocale
} from "@/lib/guideLocales";

const LOGO_URL = `${SITE_URL}/icons/twenty-levels-app-icon-512.png`;

export function guideMetadata(locale: GuideLocale, guide: Guide): Metadata {
  const path = guidePath(locale, guide.slug);
  const languages = guideLanguageAlternates(locale, guide);
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: path, languages: languages.en ? { ...languages, "x-default": languages.en } : languages },
    openGraph: { type: "article", title: guide.title, description: guide.description, url: path, locale: GUIDE_LABELS[locale].ogLocale },
    twitter: { card: "summary", title: guide.title, description: guide.description }
  };
}

export function GuideArticle({ locale, guide }: { locale: GuideLocale; guide: Guide }) {
  const labels = GUIDE_LABELS[locale];
  const url = `${SITE_URL}${guidePath(locale, guide.slug)}`;
  const indexUrl = `${SITE_URL}${guideIndexPath(locale)}`;
  const startPath = guideOnboardingPath(locale, guide.slug);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      inLanguage: locale,
      datePublished: guide.updated,
      dateModified: guide.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "Open Abundance", url: SITE_URL },
      publisher: { "@type": "Organization", name: "Open Abundance", url: SITE_URL, logo: LOGO_URL }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale,
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
        { "@type": "ListItem", position: 2, name: labels.indexTitle, item: indexUrl },
        { "@type": "ListItem", position: 3, name: guide.title, item: url }
      ]
    }
  ];
  const all = guidesFor(locale);
  const index = all.findIndex((item) => item.slug === guide.slug);
  const related = [...all.slice(index + 1), ...all.slice(0, Math.max(index, 0))].slice(0, 4);

  return (
    <main className="legal-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <article className="legal-document" lang={locale}>
        <header className="legal-document-header">
          <Link className="legal-home-link" href={startPath}>Open Abundance</Link>
          <Link className="legal-home-link" href={guideIndexPath(locale)}>{labels.allAnswers}</Link>
        </header>

        <div className="legal-document-title">
          <h1>{guide.title}</h1>
          <small>{labels.updated}: {guide.updated}</small>
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
            <h2>{labels.faq}</h2>
            {guide.faq.map((item) => (
              <div className="guide-faq-item" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </section>
        </div>

        <Link className="legal-primary-action" href={startPath}>{labels.start}</Link>
        <p>{labels.startNote}</p>

        <footer className="legal-document-footer">
          <nav aria-label={labels.related}>
            {related.map((item) => <Link href={guidePath(locale, item.slug)} key={item.slug}>{item.title}</Link>)}
          </nav>
        </footer>
      </article>
    </main>
  );
}

export function GuideIndex({ locale }: { locale: GuideLocale }) {
  const labels = GUIDE_LABELS[locale];
  return (
    <main className="legal-page">
      <article className="legal-document" lang={locale}>
        <header className="legal-document-header">
          <Link className="legal-home-link" href={guideOnboardingPath(locale)}>Open Abundance</Link>
        </header>

        <div className="legal-document-title">
          <h1>{labels.indexTitle}</h1>
          <p>{labels.indexIntro}</p>
        </div>

        <div className="legal-sections">
          {guidesFor(locale).map((guide) => (
            <section key={guide.slug}>
              <h2><Link href={guidePath(locale, guide.slug)}>{guide.title}</Link></h2>
              <p>{guide.description}</p>
            </section>
          ))}
        </div>

        <Link className="legal-primary-action" href={guideOnboardingPath(locale)}>{labels.start}</Link>
      </article>
    </main>
  );
}
