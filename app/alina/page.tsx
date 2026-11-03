import type { Metadata } from "next";
import MentorProfile from "@/components/MentorProfile";
import { MENTORS } from "@/lib/mentors";

export const revalidate = 600;

const mentor = MENTORS.alina;

export const metadata: Metadata = {
  title: mentor.metaTitle,
  description: mentor.metaDescription,
  alternates: { canonical: mentor.path },
  openGraph: { images: [mentor.coverUrl] }
};

/** Alina's public profile (docs/mentors/ALINA_AGITOVA.md). */
export default function AlinaPage() {
  return <MentorProfile mentorKey="alina" />;
}
