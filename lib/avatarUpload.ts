import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { prepareUpload, readJsonSafe } from "@/lib/uploadImage";

/**
 * Uploads a profile photo straight from the phone to the bucket and returns its public address; the caller then
 * saves that address like a pasted link. The photo is shrunk first, so a large camera picture works too.
 */
export async function uploadAvatarPhoto(file: File): Promise<string> {
  const prepared = await prepareUpload(file);
  const sign = await fetchWithSupabaseAuth("/api/social/profile/avatar/direct", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: prepared.type, size: prepared.size })
  }, { authRequired: true });
  const signed = await readJsonSafe<{ uploadUrl?: string; headers?: Record<string, string>; publicUrl?: string }>(sign);
  if (!sign.ok || !signed.uploadUrl || !signed.publicUrl) throw new Error(signed.error === "not_configured" ? "not_configured" : signed.error ?? "upload_failed");
  const put = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.headers ?? { "Content-Type": prepared.type }, body: prepared });
  if (!put.ok) throw new Error("upload_failed");
  return signed.publicUrl;
}
