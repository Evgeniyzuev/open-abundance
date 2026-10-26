import { NextRequest, NextResponse } from "next/server";
import { loadTikTokOembed, resolveTikTokLink } from "@/lib/tiktokLinks";
import { isShortVideoLink, videoEmbedFromUrl, type VideoEmbed } from "@/lib/videoEmbed";

export const dynamic = "force-dynamic";

// The answer depends only on the public link, so the CDN may keep it for a day.
const CACHE_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=86400" };

/** Follows only TikTok's own redirects for a short share link and returns the official player for it. */
async function resolveShortLink(link: string): Promise<VideoEmbed | null> {
  const full = await resolveTikTokLink(link).catch(() => null);
  const direct = full ? videoEmbedFromUrl(full) : null;
  if (direct) return { ...direct, sourceUrl: link };
  // TikTok's oEmbed also accepts short links and names the video id.
  const oembed = await loadTikTokOembed(link).catch(() => null);
  const embed = oembed?.videoId ? videoEmbedFromUrl(`https://www.tiktok.com/embed/v2/${oembed.videoId}`) : null;
  return embed ? { ...embed, sourceUrl: link } : null;
}

export async function GET(request: NextRequest) {
  const link = request.nextUrl.searchParams.get("url") ?? "";
  if (!isShortVideoLink(link)) return NextResponse.json({ embed: null }, { status: 400, headers: CACHE_HEADERS });
  const embed = await resolveShortLink(link).catch(() => null);
  return NextResponse.json({ embed }, { headers: embed ? CACHE_HEADERS : { "Cache-Control": "public, max-age=300, s-maxage=600" } });
}
