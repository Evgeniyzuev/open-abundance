// A picture pasted as a link to someone else's site breaks when that site deletes the file or stops serving it to
// other sites. On save we copy such a picture into our own R2 bucket and keep our copy's url instead. If the copy
// fails (the link is not a picture, it is too big, the host is slow), the original link is kept as it was, and the
// app shows a quiet placeholder if it ever stops loading. No project imports except r2Media, so node tests it directly.

import { putObject, publicMediaUrl, readR2Config, type R2Config } from "./r2Media.ts";

/**
 * Hosts we leave as they are. Pinterest: the recommended wishes use its pictures; Evgen (Oct 28 2026) said not to
 * move them for now.
 */
const KEEP_HOSTS = ["pinimg.com", "pinterest.com"];
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** Our own files (R2 public host, the app's own paths) and kept hosts are not copied; nor are private addresses. */
export function shouldCopyExternalImage(url: string | null | undefined, publicBaseUrl: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // a relative path: already ours
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  try {
    if (host === new URL(publicBaseUrl).hostname.toLowerCase()) return false;
  } catch {
    // A broken base url just means nothing counts as ours.
  }
  if (KEEP_HOSTS.some((kept) => host === kept || host.endsWith(`.${kept}`))) return false;
  return !isPrivateHostname(host);
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/[[\]]/g, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every((part) => Number.isInteger(part)) && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

/** A Google Drive share page becomes its direct download link; other urls are returned as they are. */
export function directImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "drive.google.com" && host !== "drive.usercontent.google.com") return url;
    const fileId = parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] ?? parsed.searchParams.get("id");
    return fileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}` : url;
  } catch {
    return url;
  }
}

/** The picture type from its first bytes (hosts often send a wrong or generic content type). */
export function sniffImageType(bytes: Uint8Array): { contentType: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { contentType: "image/png", extension: "png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { contentType: "image/webp", extension: "webp" };
  return null;
}

/**
 * Copies the picture to `{prefix}/{uuid}.{ext}` in R2 and returns the public url of the copy, or null when it could
 * not be copied (then the caller keeps the original link).
 */
export async function copyExternalImage(config: R2Config, url: string, prefix: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!shouldCopyExternalImage(url, config.publicBaseUrl)) return null;
  try {
    const response = await fetchImpl(directImageUrl(url), { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok || !response.body) return null;
    if (Number(response.headers.get("content-length") ?? "0") > MAX_BYTES) {
      await response.body.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const type = sniffImageType(bytes);
    if (!type) return null;
    const key = `${prefix.replace(/\/+$/, "")}/${crypto.randomUUID()}.${type.extension}`;
    if (!(await putObject(config, key, bytes, type.contentType, fetchImpl))) return null;
    return publicMediaUrl(config, key);
  } catch {
    return null;
  }
}

/** For the wish routes: the url to store for a wish picture (our copy when one could be made). */
export async function keepWishImage(url: string | null, userId: string, env: Record<string, string | undefined> = process.env): Promise<string | null> {
  if (!url) return url;
  const config = readR2Config(env);
  if (!config) return url;
  return (await copyExternalImage(config, url, `wishes/${userId}`)) ?? url;
}
