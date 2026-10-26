/**
 * Official embedded players for links people paste into posts and notes.
 *
 * Only the platforms' own embed URLs are used: nothing is downloaded, proxied
 * or re-encoded, and no account linking is needed. A link that cannot be
 * embedded (private channel, short redirect link, unknown site) returns null,
 * and the caller keeps showing the ordinary link.
 */

export type VideoEmbedProvider = "youtube" | "tiktok" | "instagram" | "telegram" | "x" | "vimeo" | "rutube" | "vk";

/** video: 16:9 player; vertical: 9:16 short video; post: a social post card of fixed height. */
export type VideoEmbedShape = "video" | "vertical" | "post";

export type VideoEmbed = {
  provider: VideoEmbedProvider;
  /** The link as the person shared it, always offered as "open in the app". */
  sourceUrl: string;
  /** The official player URL loaded in the iframe after the person taps. */
  embedUrl: string;
  shape: VideoEmbedShape;
  /** A still frame the platform publishes openly, when known without a request. */
  thumbnailUrl: string | null;
};

export const VIDEO_PROVIDER_LABELS: Record<VideoEmbedProvider, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  telegram: "Telegram",
  x: "X",
  vimeo: "Vimeo",
  rutube: "Rutube",
  vk: "VK Видео"
};

/** At most this many players are shown for one text, so a list of links does not become a wall of iframes. */
export const MAX_EMBEDS_PER_TEXT = 2;

const YOUTUBE_ID = /^[\w-]{11}$/;
const DIGITS = /^\d{1,25}$/;
const SAFE_SEGMENT = /^[\w-]{1,64}$/;

function parseStartSeconds(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export function videoEmbedFromUrl(value: unknown): VideoEmbed | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const sourceUrl = url.href;

  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    let vertical = false;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
      id = parts[1] ?? null;
      vertical = parts[0] === "shorts";
    }
    if (!id || !YOUTUBE_ID.test(id)) return null;
    const start = parseStartSeconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    const params = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0" });
    if (start) params.set("start", String(start));
    return {
      provider: "youtube",
      sourceUrl,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
      shape: vertical ? "vertical" : "video",
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    };
  }

  if (host === "tiktok.com") {
    // Short vm./vt. links redirect to an id we cannot know without a request, so they stay links.
    const index = parts.findIndex((part) => part === "video");
    const id = index >= 0 ? parts[index + 1] : parts[0] === "embed" ? parts.at(-1) : parts[0] === "v" ? parts[1]?.replace(/\.html$/, "") : null;
    if (!id || !DIGITS.test(id)) return null;
    return { provider: "tiktok", sourceUrl, embedUrl: `https://www.tiktok.com/player/v1/${id}?rel=0&description=1`, shape: "vertical", thumbnailUrl: null };
  }

  if (host === "instagram.com") {
    const index = parts.findIndex((part) => ["p", "reel", "reels", "tv"].includes(part));
    const code = index >= 0 ? parts[index + 1] : null;
    if (!code || !SAFE_SEGMENT.test(code)) return null;
    const kind = parts[index] === "reels" ? "reel" : parts[index];
    return { provider: "instagram", sourceUrl, embedUrl: `https://www.instagram.com/${kind}/${code}/embed/`, shape: "post", thumbnailUrl: null };
  }

  if (host === "t.me" || host === "telegram.me") {
    // Public channel posts only: t.me/<channel>/<id> or t.me/s/<channel>/<id>. Private t.me/c/ links cannot be embedded.
    const offset = parts[0] === "s" ? 1 : 0;
    const channel = parts[offset];
    const id = parts[offset + 1];
    if (!channel || channel === "c" || !/^[A-Za-z][\w]{3,31}$/.test(channel) || !id || !DIGITS.test(id)) return null;
    return { provider: "telegram", sourceUrl, embedUrl: `https://t.me/${channel}/${id}?embed=1&mode=tme`, shape: "post", thumbnailUrl: null };
  }

  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    const index = parts.findIndex((part) => part === "status" || part === "statuses");
    const id = index >= 0 ? parts[index + 1] : null;
    if (!id || !DIGITS.test(id)) return null;
    return { provider: "x", sourceUrl, embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, shape: "post", thumbnailUrl: null };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((part) => DIGITS.test(part));
    if (!id) return null;
    return { provider: "vimeo", sourceUrl, embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`, shape: "video", thumbnailUrl: null };
  }

  if (host === "rutube.ru") {
    const index = parts.findIndex((part) => part === "video" || part === "shorts" || part === "embed");
    const id = index >= 0 ? parts[index + 1] : null;
    if (!id || !/^[a-f0-9]{32}$/i.test(id)) return null;
    return { provider: "rutube", sourceUrl, embedUrl: `https://rutube.ru/play/embed/${id}?autoplay=1`, shape: parts[index] === "shorts" ? "vertical" : "video", thumbnailUrl: null };
  }

  if (host === "vk.com" || host === "vk.ru" || host === "vkvideo.ru") {
    const match = (parts.find((part) => /^(video|clip)-?\d+_\d+$/.test(part)) ?? url.searchParams.get("z") ?? "").match(/^(video|clip)(-?\d+)_(\d+)/);
    if (!match) return null;
    return {
      provider: "vk",
      sourceUrl,
      embedUrl: `https://vk.com/video_ext.php?oid=${match[2]}&id=${match[3]}&autoplay=1`,
      shape: match[1] === "clip" ? "vertical" : "video",
      thumbnailUrl: null
    };
  }

  return null;
}

/** Embeddable links found in free text (a note or a post body), in order, without repeats. */
export function findVideoEmbeds(text: string | null | undefined, limit = MAX_EMBEDS_PER_TEXT): VideoEmbed[] {
  if (!text) return [];
  const found: VideoEmbed[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'«»]+/gi)) {
    const embed = videoEmbedFromUrl(match[0].replace(/[),.!?;:]+$/, ""));
    if (!embed || seen.has(embed.embedUrl)) continue;
    seen.add(embed.embedUrl);
    found.push(embed);
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * Short share links (TikTok "Share" gives vt.tiktok.com/ZS…) hide the video id behind a
 * redirect. The client asks /api/video/resolve once, which follows only TikTok's own redirects.
 */
export function isShortVideoLink(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return /^\/[\w-]{4,20}\/?$/.test(url.pathname);
    return host === "tiktok.com" && /^\/t\/[\w-]{4,20}\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "tiktok.com" || host.endsWith(".tiktok.com");
}

/** Short links found in free text that may become players after resolving, in order, without repeats. */
export function findShortVideoLinks(text: string | null | undefined, limit = MAX_EMBEDS_PER_TEXT): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'«»]+/gi)) {
    const link = match[0].replace(/[),.!?;:]+$/, "");
    if (isShortVideoLink(link) && !found.includes(link)) found.push(link);
    if (found.length >= limit) break;
  }
  return found;
}
