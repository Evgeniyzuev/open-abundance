import type { Metadata } from "next";
import MentorProfile from "@/components/MentorProfile";
import { MENTORS } from "@/lib/mentors";

export const revalidate = 600;

const mentor = MENTORS.mark;

export const metadata: Metadata = {
  title: mentor.metaTitle,
  description: mentor.metaDescription,
  alternates: { canonical: mentor.path },
  openGraph: { images: [mentor.coverUrl] }
};

/** Mark's public profile (docs/mentors/MARK_SOKOLOV.md). */
export default function MarkPage() {
  return <MentorProfile mentorKey="mark" />;
}
