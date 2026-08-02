import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const IMAGE_LIMIT = 8 * 1024 * 1024;
const VIDEO_LIMIT = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4"
};

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const post = await getManualDraft(supabase, params.postId, user.id);
    if (!post) return NextResponse.json({ error: "Manual draft not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image or MP4 video." }, { status: 400, headers: NO_STORE_HEADERS });
    const extension = MIME_EXTENSIONS[file.type];
    const limit = file.type === "video/mp4" ? VIDEO_LIMIT : IMAGE_LIMIT;
    if (!extension || file.size > limit) {
      return NextResponse.json({ error: "Use JPEG, PNG, WebP up to 8 MB or MP4 up to 25 MB." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const durationValue = Number(form.get("durationSeconds"));
    const durationSeconds = Number.isFinite(durationValue) && durationValue > 0 ? Math.round(durationValue * 10) / 10 : null;
    if (file.type === "video/mp4" && durationSeconds !== null && durationSeconds > 30) {
      return NextResponse.json({ error: "Video must be 30 seconds or shorter." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: previous, error: previousError } = await supabase
      .from("feed_post_media")
      .select("*")
      .eq("post_id", post.id)
      .eq("sort_order", 0)
      .maybeSingle();
    if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const path = user.id + "/" + post.id + "/" + crypto.randomUUID() + "." + extension;
    const { error: uploadError } = await supabase.storage.from("feed-media").upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const mediaPayload = {
      post_id: post.id,
      media_type: file.type === "video/mp4" ? "video" : "image",
      media_url: null,
      storage_path: path,
      alt_text: {},
      sort_order: 0,
      metadata: {
        origin: "user_upload",
        contentType: file.type,
        size: file.size,
        durationSeconds
      }
    } satisfies TablesInsert<"feed_post_media">;
    const { data: media, error: mediaError } = await supabase
      .from("feed_post_media")
      .upsert(mediaPayload, { onConflict: "post_id,sort_order" })
      .select("*")
      .single();
    if (mediaError) {
      await supabase.storage.from("feed-media").remove([path]);
      return NextResponse.json({ error: mediaError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (previous?.storage_path && previous.storage_path !== path) {
      await supabase.storage.from("feed-media").remove([previous.storage_path]);
    }
    const { data: signed } = await supabase.storage.from("feed-media").createSignedUrl(path, 60 * 60);
    return NextResponse.json({
      media: { ...media, media_url: signed?.signedUrl ?? null } satisfies Tables<"feed_post_media"> & { media_url: string | null }
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to upload post media." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const post = await getManualDraft(supabase, params.postId, user.id);
    if (!post) return NextResponse.json({ error: "Manual draft not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const { data: media, error: mediaError } = await supabase
      .from("feed_post_media")
      .select("id,storage_path")
      .eq("post_id", post.id)
      .eq("sort_order", 0)
      .maybeSingle();
    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!media) return NextResponse.json({ deleted: false }, { headers: NO_STORE_HEADERS });

    const { error: deleteError } = await supabase.from("feed_post_media").delete().eq("id", media.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (media.storage_path) await supabase.storage.from("feed-media").remove([media.storage_path]);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to remove post media." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function getManualDraft(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], postId: string, userId: string) {
  const { data, error } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,post_type,status,deleted_at")
    .eq("id", postId)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data && data.post_type === "manual" && data.status === "draft" ? data : null;
}
