import { NextRequest, NextResponse } from "next/server";
import { isShortVideoLink, isTikTokHost, videoEmbedFromUrl, type VideoEmbed } from "@/lib/videoEmbed";

export const dynamic = "force-dynamic";

const MAX_HOPS = 4;
const TIMEOUT_MS = 5_000;
// The answer depends only on the public link, so the CDN may keep it for a day.
const CACHE_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };

/** Follows only TikTok's own redirects for a short share link and returns the official player for it. */
async function resolveShortLink(link: string): Promise<VideoEmbed | null> {
  let url = new URL(link);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!isTikTokHost(url.hostname) || url.protocol !== "https:" && url.protocol !== "http:") return null;
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "OpenAbundance-LinkPreview/1.0" } });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    url = new URL(location, url);
    const embed = videoEmbedFromUrl(url.href);
    if (embed) return { ...embed, sourceUrl: link };
  }
  // TikTok's oEmbed also accepts short links and names the video id.
  const oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!oembed.ok) return null;
  const payload = await oembed.json().catch(() => null) as { embed_product_id?: unknown } | null;
  const id = typeof payload?.embed_product_id === "string" ? payload.embed_product_id : null;
  const embed = id ? videoEmbedFromUrl(`https://www.tiktok.com/embed/v2/${id}`) : null;
  return embed ? { ...embed, sourceUrl: link } : null;
}

export async function GET(request: NextRequest) {
  const link = request.nextUrl.searchParams.get("url") ?? "";
  if (!isShortVideoLink(link)) return NextResponse.json({ embed: null }, { status: 400, headers: CACHE_HEADERS });
  const embed = await resolveShortLink(link).catch(() => null);
  return NextResponse.json({ embed }, { headers: embed ? CACHE_HEADERS : { "Cache-Control": "public, max-age=300, s-maxage=600" } });
}
