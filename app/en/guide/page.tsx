import type { Metadata } from "next";
import { GuideIndex } from "@/components/GuidePages";

export const metadata: Metadata = {
  title: "Answers: goals, first clients, finding help and people",
  description: "Short, practical answers: how to find your first clients, start small without savings, find people with the same goal, trade skills, build habits, and how Open Abundance works.",
  alternates: { canonical: "/en/guide", languages: { en: "/en/guide", ru: "/guide", "x-default": "/en/guide" } },
  openGraph: { locale: "en_US" }
};

export default function EnglishGuideIndexPage() {
  return <GuideIndex locale="en" />;
}
