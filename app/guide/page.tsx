import type { Metadata } from "next";
import { GuideIndex } from "@/components/GuidePages";

export const metadata: Metadata = {
  title: "Ответы: желания, привычки, единомышленники",
  description: "Короткие ответы на частые вопросы: как найти единомышленников, что делать, если одиноко, как превратить желание в план и как работает Open Abundance.",
  alternates: { canonical: "/guide", languages: { ru: "/guide", en: "/en/guide", "x-default": "/en/guide" } }
};

export default function GuideIndexPage() {
  return <GuideIndex locale="ru" />;
}
