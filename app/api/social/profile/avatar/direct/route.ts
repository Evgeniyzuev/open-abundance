import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildAvatarKey, MEDIA_TYPES, presignUpload, publicMediaUrl, readR2Config, validateUploadRequest } from "@/lib/r2Media";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** A profile picture is a photo, never a video, and small: the phone shrinks it before the upload. */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Signs a direct upload of a profile picture to Cloudflare R2. The browser PUTs the file, then saves the returned
 * public url through POST /api/social/profile/avatar (the same step as for a pasted link), which also removes the
 * previous picture from the bucket. Without R2 settings it answers 503 "not_configured" and the screen keeps the
 * link field only.
 */
export async function POST(request: NextRequest) {
  try {
    const config = readR2Config(process.env);
    if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });
    const { user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const check = validateUploadRequest({ contentType: body.contentType, size: body.size });
    if (!check.ok || check.kind !== "image") return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo.", code: "type_not_allowed" }, { status: 400, headers: NO_STORE_HEADERS });
    if (Number(body.size) > AVATAR_MAX_BYTES) return NextResponse.json({ error: "The photo is too large: up to 5 MB.", code: "too_large" }, { status: 400, headers: NO_STORE_HEADERS });

    const contentType = String(body.contentType);
    const key = buildAvatarKey(user.id, MEDIA_TYPES[contentType].extension, crypto.randomUUID());
    return NextResponse.json({
      uploadUrl: presignUpload(config, key, contentType),
      headers: { "Content-Type": contentType },
      key,
      publicUrl: publicMediaUrl(config, key)
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to prepare the upload." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
