import type { Metadata } from "next";
import { personName } from "@/lib/personName";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

/**
 * What a messenger shows for a link to a person's public page: the title with their name and the picture drawn
 * by /api/og/profile. A person who is not found gets the site's default preview.
 */
export async function profileLinkMetadata(userId: string, section: "profile" | "blog"): Promise<Metadata> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return {};
  const { data } = await createServiceSupabaseClient().from("user_profiles").select("display_name,username").eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (!data) return {};
  const name = personName(data, "Open Abundance");
  // The site layout already appends " - Open Abundance" to page titles; the preview title spells the brand out.
  const pageTitle = section === "blog" ? `${name} \u2014 blog` : name;
  const title = `${name} \u2014 Open Abundance`;
  const description = "Open Abundance: \u0431\u043b\u043e\u0433, \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0438 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0430. Blog, profile and results of a member.";
  const image = { url: `/api/og/profile/${userId}`, width: 1200, height: 630, alt: name };
  return {
    title: pageTitle,
    description,
    alternates: { canonical: section === "blog" ? `/u/${userId}/blog` : `/u/${userId}` },
    openGraph: { title, description, type: "profile", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] }
  };
}
