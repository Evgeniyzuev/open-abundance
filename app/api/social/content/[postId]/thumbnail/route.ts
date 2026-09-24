import { NextRequest, NextResponse } from "next/server";
import { loadPublicThumbnail } from "@/lib/sharePreview";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getOptionalSharedContentViewer, isSharedContentId, readAuthorizedSharedPost } from "@/lib/sharedContentAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    if (!isSharedContentId(params.postId)) return notFound();
    const viewer = await getOptionalSharedContentViewer(request);
    if (viewer.authError) return NextResponse.json({ error: "Invalid access token." }, { status: 401, headers: NO_STORE_HEADERS });

    const access = await readAuthorizedSharedPost(viewer.supabase, params.postId, viewer.userId);
    if (!access.post) return notFound();
    const { data: source, error } = await viewer.supabase
      .from("feed_post_external_links")
      .select("thumbnail_url")
      .eq("post_id", access.post.id)
      .eq("relation", "source")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !source?.thumbnail_url) return notFound();

    const image = await loadPublicThumbnail(source.thumbnail_url);
    if (!image) return notFound();
    return new NextResponse(new Uint8Array(image.body), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": image.contentType,
        "Content-Length": String(image.body.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline"
      }
    });
  } catch {
    return notFound();
  }
}

function notFound() {
  return new NextResponse(null, { status: 404, headers: NO_STORE_HEADERS });
}
