import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { normalizeLegalLocale, termsContent } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use · Open Abundance",
  description: "Terms and important disclaimers for Open Abundance."
};

export default function TermsPage({ searchParams }: { searchParams?: { lang?: string | string[] } }) {
  const locale = normalizeLegalLocale(searchParams?.lang);
  return <LegalDocument content={termsContent[locale]} locale={locale} slug="terms" />;
}
