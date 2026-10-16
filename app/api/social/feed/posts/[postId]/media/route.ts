import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildMediaKey, deleteObject, isOwnMediaKey, putObject, readR2Config, validateUploadRequest } from "@/lib/r2Media";
import { getEditableDraft, recordR2Media } from "@/lib/serverFeedMedia";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const post = await getEditableDraft(supabase, params.postId, user.id);
    if (!post) return NextResponse.json({ error: "Draft not found." }, { status: 404, headers: NO_STORE_HEADERS });

    // Media lives in Cloudflare R2 only; without its settings nothing is stored (Supabase Storage is not used).
    const config = readR2Config(process.env);
    if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image or MP4 video." }, { status: 400, headers: NO_STORE_HEADERS });
    const durationValue = Number(form.get("durationSeconds"));
    const durationSeconds = Number.isFinite(durationValue) && durationValue > 0 ? Math.round(durationValue * 10) / 10 : null;
    const check = validateUploadRequest({ contentType: file.type, size: file.size, durationSeconds });
    if (!check.ok) return NextResponse.json({ error: "Use JPEG, PNG, WebP up to 10 MB or MP4 up to 25 MB and 30 seconds.", code: check.code }, { status: 400, headers: NO_STORE_HEADERS });

    const key = buildMediaKey(user.id, post.id, check.extension, crypto.randomUUID());
    if (!(await putObject(config, key, await file.arrayBuffer(), file.type))) {
      return NextResponse.json({ error: "Could not store the file. Try again." }, { status: 502, headers: NO_STORE_HEADERS });
    }
    try {
      const media = await recordR2Media(supabase, config, { postId: post.id, userId: user.id, key, contentType: file.type, size: file.size, durationSeconds });
      return NextResponse.json({ media }, { headers: NO_STORE_HEADERS });
    } catch (recordError) {
      await deleteObject(config, key);
      return NextResponse.json({ error: recordError instanceof Error ? recordError.message : "Failed to save post media." }, { status: 500, headers: NO_STORE_HEADERS });
    }
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
    const post = await getEditableDraft(supabase, params.postId, user.id);
    if (!post) return NextResponse.json({ error: "Draft not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const { data: media, error: mediaError } = await supabase
      .from("feed_post_media")
      .select("id,storage_path,metadata")
      .eq("post_id", post.id)
      .eq("sort_order", 0)
      .maybeSingle();
    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!media) return NextResponse.json({ deleted: false }, { headers: NO_STORE_HEADERS });

    const { error: deleteError } = await supabase.from("feed_post_media").delete().eq("id", media.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (media.storage_path) await supabase.storage.from("feed-media").remove([media.storage_path]);
    // A file uploaded straight to R2 is removed from the bucket too (best effort: the post is already clean).
    const metadata = (media.metadata ?? {}) as Record<string, unknown>;
    const config = readR2Config(process.env);
    if (config && metadata.origin === "r2" && isOwnMediaKey(metadata.key, user.id, post.id)) await deleteObject(config, metadata.key).catch(() => false);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to remove post media." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
