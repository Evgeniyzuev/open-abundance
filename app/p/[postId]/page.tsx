import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isSharedContentId } from "@/lib/sharedContentAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicSharedPost = {
  id: string;
  title: string | null;
  body: string | null;
  authorName: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  media: Array<{ id: string; media_type: string }>;
};

async function loadPublicPost(postId: string): Promise<PublicSharedPost | null> {
  if (!isSharedContentId(postId)) return null;
  const supabase = createServiceSupabaseClient();
  const { data: post, error } = await supabase.from("feed_posts")
    .select("id,author_user_id,title,body,status,visibility,post_type,deleted_at")
    .eq("id", postId).eq("post_type", "external_link").eq("status", "published").eq("visibility", "public").is("deleted_at", null).maybeSingle();
  if (error || !post) return null;
  const [{ data: source, error: sourceError }, { data: author, error: authorError }, { data: media, error: mediaError }] = await Promise.all([
    supabase.from("feed_post_external_links").select("external_url,title,description,thumbnail_url,relation")
      .eq("post_id", post.id).eq("relation", "source").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    post.author_user_id ? supabase.from("user_profiles").select("username,display_name").eq("user_id", post.author_user_id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("feed_post_media").select("id,media_type").eq("post_id", post.id).order("sort_order", { ascending: true })
  ]);
  if (sourceError || authorError || mediaError || !source || !isSafeHttpUrl(source.external_url)) return null;
  const origin = "/api/social/content/" + post.id;
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    authorName: author?.display_name ?? author?.username ?? null,
    sourceUrl: source.external_url,
    sourceTitle: source.title,
    description: source.description,
    thumbnailUrl: source.thumbnail_url ? `${origin}/thumbnail` : null,
    media: (media ?? []).map((item) => ({ id: item.id, media_type: item.media_type }))
  };
}

export async function generateMetadata({ params }: { params: { postId: string } }): Promise<Metadata> {
  const post = await loadPublicPost(params.postId);
  if (!post) return { title: "Open Abundance", robots: { index: false, follow: false } };
  const title = post.title || post.sourceTitle || "Shared material";
  const description = post.body || post.description || "A shared material on Open Abundance.";
  const image = post.thumbnailUrl ? new URL(post.thumbnailUrl, "https://open-abundance.vercel.app").toString() : undefined;
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: `/p/${post.id}` },
    openGraph: { type: "article", title, description: description.slice(0, 300), url: `/p/${post.id}`, images: image ? [image] : [] },
    twitter: { card: image ? "summary_large_image" : "summary", title, description: description.slice(0, 300), images: image ? [image] : [] }
  };
}

export default async function SharedPostPage({ params }: { params: { postId: string } }) {
  const post = await loadPublicPost(params.postId);
  if (!post) notFound();
  const title = post.title || post.sourceTitle || "Shared material";
  return <main className="public-shared-post">
    <header><a href="/">Open Abundance</a><span>{post.authorName ?? "Open Abundance member"}</span></header>
    <article>
      {post.thumbnailUrl ? <Image className="public-shared-post-cover" src={post.thumbnailUrl} alt="" width={1200} height={630} unoptimized /> : null}
      <h1>{title}</h1>
      {post.body ? <p className="public-shared-post-note">{post.body}</p> : null}
      {post.description ? <p>{post.description}</p> : null}
      {post.authorName ? <p>{post.authorName}</p> : null}
      {post.media.map((media) => <a className="public-shared-post-media" key={media.id} href={`/api/social/content/${post.id}/media?mediaId=${encodeURIComponent(media.id)}`}>
        {media.media_type === "image" ? <img src={`/api/social/content/${post.id}/media?mediaId=${encodeURIComponent(media.id)}`} alt="" /> : <span>Open attached video</span>}
      </a>)}
      <a className="primary-button" href={post.sourceUrl} target="_blank" rel="noopener noreferrer">Open source</a>
    </article>
  </main>;
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password; }
  catch { return false; }
}
