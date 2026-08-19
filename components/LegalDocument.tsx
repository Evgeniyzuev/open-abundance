import Link from "next/link";
import { LEGAL_VERSION, legalUi, type LegalDocumentContent, type LegalLocale } from "@/lib/legal";

type LegalDocumentProps = {
  content: LegalDocumentContent;
  locale: LegalLocale;
  slug: "privacy" | "terms" | "contact";
  primaryAction?: {
    href: string;
    label: string;
  };
};

export default function LegalDocument({ content, locale, primaryAction, slug }: LegalDocumentProps) {
  const ui = legalUi[locale];

  return (
    <main className="legal-page">
      <article className="legal-document" lang={locale}>
        <header className="legal-document-header">
          <Link className="legal-home-link" href="/">Open Abundance</Link>
          <nav aria-label={ui.language} className="legal-language-switcher">
            <Link aria-current={locale === "ru" ? "page" : undefined} href={`/${slug}?lang=ru`}>RU</Link>
            <Link aria-current={locale === "en" ? "page" : undefined} href={`/${slug}?lang=en`}>EN</Link>
          </nav>
        </header>

        <div className="legal-document-title">
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <small>{ui.updated}: {LEGAL_VERSION}</small>
        </div>

        {content.notice ? <aside className="legal-notice">{content.notice}</aside> : null}

        <div className="legal-sections">
          {content.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            </section>
          ))}
        </div>

        {primaryAction ? (
          <a className="legal-primary-action" href={primaryAction.href} rel="noreferrer" target="_blank">
            {primaryAction.label}
          </a>
        ) : null}

        <footer className="legal-document-footer">
          <nav aria-label={ui.terms}>
            <Link href={`/privacy?lang=${locale}`}>{ui.privacy}</Link>
            <Link href={`/terms?lang=${locale}`}>{ui.terms}</Link>
            <Link href={`/contact?lang=${locale}`}>{ui.contact}</Link>
          </nav>
          <Link href="/">{ui.home}</Link>
        </footer>
      </article>
    </main>
  );
}
