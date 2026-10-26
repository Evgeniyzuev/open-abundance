import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { prepareUpload, readJsonSafe } from "@/lib/uploadImage";

/**
 * Uploads a wish picture straight from the phone to the bucket and returns its public address; the form then keeps
 * it like a pasted link. The photo is shrunk first. Errors carry a code: daily_limit, total_limit, not_configured,
 * upload_too_large or upload_failed.
 */
export async function uploadWishPhoto(file: File): Promise<string> {
  const prepared = await prepareUpload(file);
  const sign = await fetchWithSupabaseAuth("/api/wishes/image", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: prepared.type, size: prepared.size })
  }, { authRequired: true });
  const signed = await readJsonSafe<{ uploadUrl?: string; headers?: Record<string, string>; publicUrl?: string; code?: string }>(sign);
  if (!sign.ok || !signed.uploadUrl || !signed.publicUrl) throw new Error(signed.code ?? (signed.error === "not_configured" ? "not_configured" : "upload_failed"));
  const put = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.headers ?? { "Content-Type": prepared.type }, body: prepared });
  if (!put.ok) throw new Error("upload_failed");
  return signed.publicUrl;
}
