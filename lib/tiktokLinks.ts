import { isShortVideoLink, isTikTokHost, videoEmbedFromUrl } from "./videoEmbed.ts";

/**
 * TikTok share links (vt.tiktok.com/ZS…) hide the video behind a redirect, and TikTok's
 * still frames are signed URLs that expire after a few days. These helpers talk only to
 * TikTok's own hosts: they follow its redirects by hand and ask its official oEmbed.
 */

const MAX_HOPS = 4;
const TIMEOUT_MS = 5_000;

export type TikTokOembed = { title: string | null; authorName: string | null; authorUrl: string | null; thumbnailUrl: string | null; videoId: string | null };

/** The full www.tiktok.com/@user/video/<id> address behind a short link, or the link itself when it is already full. */
export async function resolveTikTokLink(link: string): Promise<string | null> {
  if (!isShortVideoLink(link)) return videoEmbedFromUrl(link)?.provider === "tiktok" ? link : null;
  let url = new URL(link);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!isTikTokHost(url.hostname) || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "OpenAbundance-LinkPreview/1.0" } });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return null;
    url = new URL(location, url);
    if (videoEmbedFromUrl(url.href)?.provider === "tiktok") {
      url.search = "";
      return url.href;
    }
  }
  return null;
}

/** TikTok's official oEmbed for a full or short link; the short link is resolved first. */
export async function loadTikTokOembed(link: string): Promise<TikTokOembed | null> {
  const full = await resolveTikTokLink(link).catch(() => null);
  const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(full ?? link)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return null;
  const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, max) : null;
  const https = (value: unknown) => typeof value === "string" && /^https:\/\//.test(value) ? value : null;
  const videoId = text(payload.embed_product_id, 30) ?? (full ? videoEmbedFromUrl(full)?.embedUrl.match(/\/(\d+)\?/)?.[1] ?? null : null);
  return { title: text(payload.title, 240), authorName: text(payload.author_name, 120), authorUrl: https(payload.author_url), thumbnailUrl: https(payload.thumbnail_url), videoId };
}

/** True when a TikTok CDN still frame has passed its signed x-expires time (or is about to, within an hour). */
export function isExpiredTikTokThumbnail(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return true;
  try {
    const expires = Number(new URL(value).searchParams.get("x-expires"));
    return Number.isFinite(expires) && expires > 0 && expires * 1000 < now + 3_600_000;
  } catch {
    return true;
  }
}
