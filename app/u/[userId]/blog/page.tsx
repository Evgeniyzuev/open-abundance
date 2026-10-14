import PublicUserPage from "@/components/PublicUserPage";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { UserProvider } from "@/components/UserProvider";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isSharedContentId } from "@/lib/sharedContentAccess";

// A shared reality day gets its own link preview: the day card image.
export async function generateMetadata({ searchParams }: { searchParams?: { post?: string } }): Promise<Metadata> {
  if (!isSharedContentId(searchParams?.post)) return {};
  const { data: post } = await createServiceSupabaseClient()
    .from("feed_posts")
    .select("id,post_type,status,visibility,deleted_at")
    .eq("id", searchParams.post)
    .maybeSingle();
  if (!post || post.status !== "published" || post.visibility !== "public" || post.deleted_at || !["daily_progress", "level_up"].includes(post.post_type)) return {};
  const image = `/api/reality/card/${post.id}?format=post`;
  return {
    openGraph: { images: [{ url: image, width: 1080, height: 1350 }] },
    twitter: { card: "summary_large_image", images: [image] }
  };
}

export default async function UserBlogRoute({ params, searchParams }: { params: { userId: string }; searchParams?: { post?: string } }) {
  if (isSharedContentId(searchParams?.post)) {
    const { data: post } = await createServiceSupabaseClient().from("feed_posts").select("id,post_type").eq("id", searchParams.post).maybeSingle();
    if (post?.post_type === "external_link") redirect(`/p/${post.id}`);
  }
  return (
    <>
      <ServiceWorkerRegister />
      <UserProvider>
        <PublicUserPage userId={params.userId} initialView="blog" initialPostId={isSharedContentId(searchParams?.post) ? searchParams?.post ?? null : null} />
      </UserProvider>
    </>
  );
}
