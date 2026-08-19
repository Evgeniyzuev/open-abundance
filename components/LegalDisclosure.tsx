import Link from "next/link";

type LegalDisclosureProps = {
  locale: "ru" | "en";
  summary: string;
  privacy: string;
  terms: string;
  contact: string;
  acknowledgement?: string;
};

export default function LegalDisclosure({
  acknowledgement,
  contact,
  locale,
  privacy,
  summary,
  terms
}: LegalDisclosureProps) {
  const languageQuery = `?lang=${locale}`;

  return (
    <details className="legal-disclosure">
      <summary>{summary}</summary>
      <nav aria-label={summary}>
        <Link href={`/privacy${languageQuery}`}>{privacy}</Link>
        <Link href={`/terms${languageQuery}`}>{terms}</Link>
        <Link href={`/contact${languageQuery}`}>{contact}</Link>
      </nav>
      {acknowledgement ? <small>{acknowledgement}</small> : null}
    </details>
  );
}
