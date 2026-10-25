import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PostDiscussion, { type DiscussionPost } from "@/components/PostDiscussion";
import { UserProvider } from "@/components/UserProvider";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isSharedContentId } from "@/lib/sharedContentAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The discussion page of one public post: the post on top, the whole comment thread below.
// Comments need a signed-in viewer (the interactions API is for members), guests get a sign-in link.
async function loadDiscussionPost(postId: string): Promise<DiscussionPost | null> {
  if (!isSharedContentId(postId)) return null;
  const supabase = createServiceSupabaseClient();
  const { data: post, error } = await supabase.from("feed_posts")
    .select("id,author_user_id,author_label,title,body,post_type,status,visibility,created_at,updated_at,published_at")
    .eq("id", postId).eq("status", "published").eq("visibility", "public").is("deleted_at", null).maybeSingle();
  if (error || !post) return null;
  const [{ data: author }, { data: media }] = await Promise.all([
    post.author_user_id
      ? supabase.from("user_profiles").select("username,display_name").eq("user_id", post.author_user_id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("feed_post_media").select("media_type,media_url").eq("post_id", post.id).order("sort_order", { ascending: true }).limit(1)
  ]);
  // Only an editorial image stored in the app (a /path) is shown here; uploads go through their own access checks.
  const cover = media?.[0]?.media_type === "image" && typeof media[0].media_url === "string" && media[0].media_url.startsWith("/") ? media[0].media_url : null;
  return {
    id: post.id,
    authorUserId: post.author_user_id,
    authorName: author?.display_name ?? (author?.username ? `@${author.username}` : post.author_label ?? "Open Abundance"),
    authorUsername: author?.username ?? null,
    postType: post.post_type,
    title: post.title,
    body: post.body,
    cover,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    publishedAt: post.published_at
  };
}

export async function generateMetadata({ params }: { params: { postId: string } }): Promise<Metadata> {
  const post = await loadDiscussionPost(params.postId);
  if (!post) return { title: "Open Abundance", robots: { index: false, follow: false } };
  const text = (post.title || post.body || "Discussion on Open Abundance").trim();
  return {
    title: text.slice(0, 80),
    description: (post.body || text).slice(0, 300),
    alternates: { canonical: `/d/${post.id}` },
    openGraph: { type: "article", title: text.slice(0, 80), description: (post.body || text).slice(0, 300), url: `/d/${post.id}`, images: post.cover ? [post.cover] : [] }
  };
}

export default async function DiscussionRoute({ params }: { params: { postId: string } }) {
  const post = await loadDiscussionPost(params.postId);
  if (!post) notFound();
  return <UserProvider><PostDiscussion post={post} /></UserProvider>;
}
