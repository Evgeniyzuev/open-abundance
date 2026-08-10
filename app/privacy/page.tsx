import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { normalizeLegalLocale, privacyContent } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · Open Abundance",
  description: "How Open Abundance processes and protects data."
};

export default function PrivacyPage({ searchParams }: { searchParams?: { lang?: string | string[] } }) {
  const locale = normalizeLegalLocale(searchParams?.lang);
  return <LegalDocument content={privacyContent[locale]} locale={locale} slug="privacy" />;
}
