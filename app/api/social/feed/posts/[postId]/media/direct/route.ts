import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  buildMediaKey,
  deleteObject,
  headObject,
  isOwnMediaKey,
  MAX_UPLOADS_PER_DAY,
  MEDIA_TYPES,
  presignUpload,
  publicMediaUrl,
  readR2Config,
  validateUploadRequest
} from "@/lib/r2Media";
import { getEditableDraft, recordR2Media } from "@/lib/serverFeedMedia";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const VALIDATION_MESSAGES = {
  type_not_allowed: "Use JPEG, PNG, WebP or MP4.",
  too_large: "The file is too large: up to 10 MB for a photo and 25 MB for a video.",
  bad_size: "The file is empty.",
  video_too_long: "Video must be 30 seconds or shorter."
} as const;

/**
 * Direct media upload to Cloudflare R2 in two steps, so the file never passes through this function:
 * `sign` checks the person and the draft and returns one short-lived signed PUT URL, `complete` checks that
 * the file really arrived and records it for the post. Without R2 settings both answer 503 "not_configured"
 * and the browser falls back to the old upload through /media.
 */
export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const config = readR2Config(process.env);
    if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const post = await getEditableDraft(supabase, params.postId, user.id);
    if (!post) return NextResponse.json({ error: "Draft not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const check = validateUploadRequest({ contentType: body.contentType, size: body.size, durationSeconds: body.durationSeconds });
    if (!check.ok) return NextResponse.json({ error: VALIDATION_MESSAGES[check.code], code: check.code }, { status: 400, headers: NO_STORE_HEADERS });
    const contentType = String(body.contentType);

    if (body.action === "sign") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from("feed_post_media")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>uploaderUserId", user.id)
        .gte("created_at", since);
      if (countError) return NextResponse.json({ error: countError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if ((count ?? 0) >= MAX_UPLOADS_PER_DAY) return NextResponse.json({ error: "Daily upload limit reached. Try again tomorrow.", code: "daily_limit" }, { status: 429, headers: NO_STORE_HEADERS });

      const key = buildMediaKey(user.id, post.id, check.extension, crypto.randomUUID());
      return NextResponse.json({
        uploadUrl: presignUpload(config, key, contentType),
        key,
        headers: { "Content-Type": contentType },
        publicUrl: publicMediaUrl(config, key)
      }, { headers: NO_STORE_HEADERS });
    }

    if (body.action === "complete") {
      if (!isOwnMediaKey(body.key, user.id, post.id)) return NextResponse.json({ error: "Invalid file key." }, { status: 400, headers: NO_STORE_HEADERS });
      const key = body.key;

      // The browser says it uploaded; the bucket decides. A missing, wrong or oversized file is rejected and removed.
      const stored = await headObject(config, key);
      if (!stored) return NextResponse.json({ error: "The file did not arrive. Try again.", code: "not_uploaded" }, { status: 409, headers: NO_STORE_HEADERS });
      const rule = MEDIA_TYPES[contentType];
      if (stored.size <= 0 || stored.size > rule.maxBytes || stored.contentType !== contentType) {
        await deleteObject(config, key);
        return NextResponse.json({ error: VALIDATION_MESSAGES.too_large, code: "rejected" }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const durationValue = Number(body.durationSeconds);
      const durationSeconds = Number.isFinite(durationValue) && durationValue > 0 ? Math.round(durationValue * 10) / 10 : null;
      let media;
      try {
        media = await recordR2Media(supabase, config, { postId: post.id, userId: user.id, key, contentType, size: stored.size, durationSeconds });
      } catch (recordError) {
        await deleteObject(config, key);
        return NextResponse.json({ error: recordError instanceof Error ? recordError.message : "Failed to save post media." }, { status: 500, headers: NO_STORE_HEADERS });
      }

      return NextResponse.json({ media }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to upload post media." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
