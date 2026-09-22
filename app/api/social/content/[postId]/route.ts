import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getOptionalSharedContentViewer, isSharedContentId, readAuthorizedSharedPost, sameOriginMediaUrl } from "@/lib/sharedContentAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    if (!isSharedContentId(params.postId)) return json({ error: "Content not found." }, 404);
    const viewer = await getOptionalSharedContentViewer(request);
    if (viewer.authError) return json({ error: "Invalid access token." }, 401);

    const access = await readAuthorizedSharedPost(viewer.supabase, params.postId, viewer.userId);
    if (!access.post) return json({ error: "Content not found." }, 404);

    const [{ data: sourceRows, error: sourceError }, { data: mediaRows, error: mediaError }, { data: author, error: authorError }] = await Promise.all([
      viewer.supabase
        .from("feed_post_external_links")
        .select("id,post_id,provider,external_url,external_post_id,author_handle,author_name,title,caption,description,canonical_url,thumbnail_url,metadata_status,embed_status,relation,created_at,updated_at")
        .eq("post_id", access.post.id)
        .eq("relation", "source")
        .order("created_at", { ascending: true })
        .limit(1),
      viewer.supabase
        .from("feed_post_media")
        .select("id,post_id,media_type,storage_path,sort_order,created_at,updated_at")
        .eq("post_id", access.post.id)
        .order("sort_order", { ascending: true }),
      access.post.author_user_id
        ? viewer.supabase.from("user_profiles").select("user_id,username,display_name,avatar_url,avatar_position,level,created_at").eq("user_id", access.post.author_user_id).maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    if (sourceError || mediaError || authorError) return json({ error: "Could not load content." }, 500);
    const source = sourceRows?.[0];
    if (!source) return json({ error: "Content not found." }, 404);
    const externalUrl = safeExternalUrl(source.external_url);
    if (!externalUrl) return json({ error: "Content not found." }, 404);
    const previewStatus = source.metadata_status
      ?? (source.title || source.description || source.thumbnail_url ? "ready" : "link_only");

    const authorName = author?.display_name ?? author?.username ?? null;
    const media = (mediaRows ?? []).flatMap((item) => {
      if (!item.storage_path || !isAllowedStoredMediaPath(item.storage_path, access.post.author_user_id, access.post.id)) return [];
      const mediaUrl = sameOriginMediaUrl(access.post!.id, item.id);
      return [{
        id: item.id,
        post_id: item.post_id,
        media_type: item.media_type,
        media_url: mediaUrl,
        thumbnail_url: item.media_type === "image" ? mediaUrl : null,
        alt_text: {},
        source_url: null,
        source_label: null,
        sort_order: item.sort_order,
        created_at: item.created_at,
        updated_at: item.updated_at
      }];
    });

    return NextResponse.json({
      post: {
        id: access.post.id,
        author_user_id: access.post.author_user_id,
        author_label: authorName,
        authorName,
        author: author ? { ...author } : null,
        post_type: access.post.post_type,
        status: access.post.status,
        visibility: access.post.visibility,
        title: access.post.title,
        body: access.post.body,
        created_at: access.post.created_at,
        updated_at: access.post.updated_at,
        published_at: access.post.published_at,
        deleted_at: null,
        externalLinks: [{
          id: source.id,
          post_id: source.post_id,
          provider: source.provider,
          external_url: externalUrl,
          external_post_id: source.external_post_id,
          author_handle: source.author_handle,
          author_name: source.author_name,
          title: source.title,
          caption: source.caption,
          description: source.description,
          canonical_url: source.canonical_url ? safeExternalUrl(source.canonical_url) : null,
          thumbnail_url: source.thumbnail_url ? `/api/social/content/${access.post.id}/thumbnail` : null,
          metadata_status: previewStatus,
          embed_status: source.embed_status,
          relation: source.relation,
          created_at: source.created_at,
          updated_at: source.updated_at
        }],
        media,
        statBlocks: [],
        wish: null,
        projectReview: null,
        systemStory: null,
        canEdit: access.isOwner,
        isOwner: access.isOwner
      }
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return json({ error: "Could not load content." }, 500);
  }
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isAllowedStoredMediaPath(path: string, ownerId: string | null, postId: string): boolean {
  return Boolean(ownerId && path.startsWith(`${ownerId}/${postId}/`) && !path.split("/").some((part) => part === ".."));
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
