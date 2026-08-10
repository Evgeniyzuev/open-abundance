import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { contactContent, getSupportUrl, normalizeLegalLocale } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact · Open Abundance",
  description: "Open Abundance support and data requests."
};

export default function ContactPage({ searchParams }: { searchParams?: { lang?: string | string[] } }) {
  const locale = normalizeLegalLocale(searchParams?.lang);
  return (
    <LegalDocument
      content={contactContent[locale]}
      locale={locale}
      slug="contact"
      primaryAction={{
        href: getSupportUrl(),
        label: locale === "ru" ? "Открыть канал поддержки" : "Open support channel"
      }}
    />
  );
}
