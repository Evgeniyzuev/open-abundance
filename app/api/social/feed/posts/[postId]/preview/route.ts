import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { loadLinkPreview, normalizeLinkSource, toLegacyEmbedStatus } from "@/lib/sharePreview";
import { recordProductEvent } from "@/lib/serverAnalytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const { data: post, error: postError } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,post_type,deleted_at")
    .eq("id", params.postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (postError) return NextResponse.json({ error: postError.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (!post || post.author_user_id !== user.id || post.post_type !== "external_link") {
    return NextResponse.json({ error: "Saved material not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const { data: source, error: sourceError } = await supabase
    .from("feed_post_external_links")
    .select("id,external_url,provider,external_post_id,author_handle")
    .eq("post_id", post.id)
    .eq("relation", "source")
    .maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (!source) return NextResponse.json({ error: "Source link not found." }, { status: 404, headers: NO_STORE_HEADERS });

  const normalized = normalizeLinkSource(source.external_url);
  if (!normalized) return NextResponse.json({ error: "Invalid source link." }, { status: 400, headers: NO_STORE_HEADERS });
  const preview = await loadLinkPreview(normalized);
  const { error: updateError } = await supabase
    .from("feed_post_external_links")
    .update({
      title: preview.title,
      description: preview.description,
      author_name: preview.authorName,
      thumbnail_url: preview.thumbnailUrl,
      canonical_url: preview.canonicalUrl,
      metadata_status: preview.status,
      embed_status: toLegacyEmbedStatus(preview.status),
      fetched_at: new Date().toISOString()
    })
    .eq("id", source.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

  await recordProductEvent({ entityId: post.id, entityType: "feed_post", eventName: "saved_content_previewed", properties: { provider: source.provider, status: preview.status }, source: "server", userId: user.id });

  return NextResponse.json({ preview }, { headers: NO_STORE_HEADERS });
}
