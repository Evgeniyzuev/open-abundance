import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  buildWishImageKey,
  listObjects,
  MEDIA_TYPES,
  presignUpload,
  publicMediaUrl,
  readR2Config,
  validateUploadRequest
} from "@/lib/r2Media";
import { WISH_IMAGES_PER_DAY, WISH_IMAGES_TOTAL } from "@/lib/wishImageLimits";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** The phone shrinks the photo to about 1600 px before the upload, so a wish picture is small. */
const WISH_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Signs a direct upload of a wish picture to Cloudflare R2. The browser PUTs the file and puts the returned public
 * url into the wish's image field, the same as a pasted link. The person's files under wishes/{user}/ are counted
 * in the bucket itself: at most WISH_IMAGES_PER_DAY in 24 hours and WISH_IMAGES_TOTAL in all. Without R2 settings
 * it answers 503 "not_configured" and the form keeps the link field only.
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
    if (Number(body.size) > WISH_IMAGE_MAX_BYTES) return NextResponse.json({ error: "The photo is too large.", code: "too_large" }, { status: 400, headers: NO_STORE_HEADERS });

    const stored = await listObjects(config, `wishes/${user.id}/`);
    if (stored.length >= WISH_IMAGES_TOTAL) return NextResponse.json({ error: "Wish photo limit reached.", code: "total_limit", limit: WISH_IMAGES_TOTAL }, { status: 429, headers: NO_STORE_HEADERS });
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const today = stored.filter((object) => Date.parse(object.lastModified) >= since).length;
    if (today >= WISH_IMAGES_PER_DAY) return NextResponse.json({ error: "Daily upload limit reached. Try again tomorrow.", code: "daily_limit", limit: WISH_IMAGES_PER_DAY }, { status: 429, headers: NO_STORE_HEADERS });

    const contentType = String(body.contentType);
    const key = buildWishImageKey(user.id, MEDIA_TYPES[contentType].extension, crypto.randomUUID());
    return NextResponse.json({
      uploadUrl: presignUpload(config, key, contentType),
      headers: { "Content-Type": contentType },
      key,
      publicUrl: publicMediaUrl(config, key),
      remainingToday: WISH_IMAGES_PER_DAY - today - 1
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to prepare the upload." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
