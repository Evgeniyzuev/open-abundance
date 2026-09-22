import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getOptionalSharedContentViewer, isSharedContentId, readAuthorizedSharedPost } from "@/lib/sharedContentAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MEDIA_LIMITS: Record<string, { contentType: string; maxBytes: number }> = {
  image: { contentType: "image/jpeg", maxBytes: 8 * 1024 * 1024 },
  video: { contentType: "video/mp4", maxBytes: 25 * 1024 * 1024 }
};

export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    if (!isSharedContentId(params.postId)) return notFound();
    const mediaId = request.nextUrl.searchParams.get("mediaId");
    if (!isSharedContentId(mediaId)) return notFound();

    const viewer = await getOptionalSharedContentViewer(request);
    if (viewer.authError) return NextResponse.json({ error: "Invalid access token." }, { status: 401, headers: NO_STORE_HEADERS });
    const access = await readAuthorizedSharedPost(viewer.supabase, params.postId, viewer.userId);
    if (!access.post) return notFound();

    const { data: media, error } = await viewer.supabase
      .from("feed_post_media")
      .select("id,post_id,media_type,storage_path,metadata")
      .eq("id", mediaId)
      .eq("post_id", access.post.id)
      .maybeSingle();
    if (error || !media?.storage_path) return notFound();
    if (!isAllowedStoredMediaPath(media.storage_path, access.post.author_user_id, access.post.id)) return notFound();

    const contentType = typeof media.metadata === "object" && media.metadata && "contentType" in media.metadata
      ? String(media.metadata.contentType)
      : "";
    const allowed = MEDIA_LIMITS[media.media_type];
    if (!allowed || contentType !== allowed.contentType) return notFound();

    const { data: file, error: downloadError } = await viewer.supabase.storage.from("feed-media").download(media.storage_path);
    if (downloadError || !file || file.size > allowed.maxBytes) return notFound();
    return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": allowed.contentType,
        "Content-Length": String(file.size),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline"
      }
    });
  } catch {
    return notFound();
  }
}

function isAllowedStoredMediaPath(path: string, ownerId: string | null, postId: string): boolean {
  return Boolean(ownerId && path.startsWith(`${ownerId}/${postId}/`) && !path.split("/").some((part) => part === ".."));
}

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE_HEADERS });
}
