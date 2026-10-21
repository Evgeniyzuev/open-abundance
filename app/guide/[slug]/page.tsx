import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle, guideMetadata } from "@/components/GuidePages";
import { getLocalizedGuide, guidesFor } from "@/lib/guideLocales";

export const dynamicParams = false;

export function generateStaticParams() {
  return guidesFor("ru").map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getLocalizedGuide("ru", params.slug);
  return guide ? guideMetadata("ru", guide) : {};
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = getLocalizedGuide("ru", params.slug);
  if (!guide) notFound();
  return <GuideArticle locale="ru" guide={guide} />;
}
