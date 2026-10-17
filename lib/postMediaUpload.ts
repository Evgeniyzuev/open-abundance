import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { prepareUpload, readJsonSafe, UPLOAD_SAFE_BYTES, UploadTooLargeError } from "@/lib/uploadImage";

const DIRECT_VIDEO_BYTES = 25 * 1024 * 1024;

/**
 * Adds a photo or a short video to a draft post. With Cloudflare R2 configured the file goes straight from
 * the phone to the bucket by a signed URL (no size limit from Vercel). Without R2, or when the direct upload
 * fails, the older path through `/media` is used, which only takes a file that fits one 4 MB request.
 */
export async function uploadPostMedia(postId: string, file: File, durationSeconds?: number): Promise<void> {
  const prepared = await prepareUpload(file, { videoMaxBytes: DIRECT_VIDEO_BYTES });
  const base = `/api/social/feed/posts/${postId}/media`;

  const legacyUpload = async () => {
    if (prepared.size > UPLOAD_SAFE_BYTES) throw new UploadTooLargeError();
    const form = new FormData();
    form.append("file", prepared);
    const legacy = await fetchWithSupabaseAuth(base, { method: "POST", body: form }, { authRequired: true });
    const legacyPayload = await readJsonSafe<{ error?: string }>(legacy);
    if (!legacy.ok) throw uploadError(legacy.status, legacyPayload.error);
  };

  const sign = await fetchWithSupabaseAuth(`${base}/direct`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sign", contentType: prepared.type, size: prepared.size, durationSeconds })
  }, { authRequired: true });
  const signed = await readJsonSafe<{ uploadUrl?: string; key?: string; headers?: Record<string, string> }>(sign);

  if (sign.status === 503 && signed.error === "not_configured") return legacyUpload();
  if (!sign.ok || !signed.uploadUrl || !signed.key) throw uploadError(sign.status, signed.error);

  try {
    const put = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.headers ?? { "Content-Type": prepared.type }, body: prepared });
    if (!put.ok) throw new Error("upload_failed");
  } catch {
    // The bucket refused or could not be reached (settings, CORS, network): a small file still goes the old way.
    return legacyUpload();
  }

  const complete = await fetchWithSupabaseAuth(`${base}/direct`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete", key: signed.key, contentType: prepared.type, size: prepared.size, durationSeconds })
  }, { authRequired: true });
  const completed = await readJsonSafe<{ error?: string }>(complete);
  if (!complete.ok) throw uploadError(complete.status, completed.error);
}

/** The server's own message is kept when it is readable; a bare status code becomes a generic failure. */
function uploadError(status: number, message?: string): Error {
  if (status === 413 || message === "upload_too_large") return new UploadTooLargeError();
  return new Error(message && !message.startsWith("http_") ? message : "upload_failed");
}
