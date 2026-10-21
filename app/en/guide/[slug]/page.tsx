import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle, guideMetadata } from "@/components/GuidePages";
import { getLocalizedGuide, guidesFor } from "@/lib/guideLocales";

export const dynamicParams = false;

export function generateStaticParams() {
  return guidesFor("en").map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getLocalizedGuide("en", params.slug);
  return guide ? guideMetadata("en", guide) : {};
}

export default function EnglishGuidePage({ params }: { params: { slug: string } }) {
  const guide = getLocalizedGuide("en", params.slug);
  if (!guide) notFound();
  return <GuideArticle locale="en" guide={guide} />;
}
