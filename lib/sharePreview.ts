import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export type LinkSource = {
  provider: "tiktok" | "instagram" | "telegram" | "youtube" | "x" | "website";
  externalUrl: string;
  normalizedUrl: string;
  externalPostId: string | null;
  authorHandle: string | null;
  fallbackTitle: string;
};

export type LinkPreview = {
  title: string | null;
  description: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  canonicalUrl: string | null;
  status: "ready" | "link_only" | "failed";
};

/**
 * The metadata loader uses `ready`, while the legacy embed column uses
 * `available`. Keep the two status vocabularies separate at the boundary so
 * preview refreshes continue to satisfy the existing database constraint.
 */
export function toLegacyEmbedStatus(status: LinkPreview["status"]): "available" | "link_only" | "failed" {
  return status === "ready" ? "available" : status;
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

export function normalizeLinkSource(value: unknown): LinkSource | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const provider: LinkSource["provider"] = host === "tiktok.com" || host.endsWith(".tiktok.com") ? "tiktok"
      : host === "instagram.com" || host.endsWith(".instagram.com") ? "instagram"
        : host === "t.me" || host === "telegram.me" ? "telegram"
          : host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" ? "youtube"
            : host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com") ? "x" : "website";
    const pathParts = url.pathname.split("/").filter(Boolean);
    let externalPostId: string | null = null;
    let authorHandle: string | null = null;
    let fallbackTitle = host;
    if (provider === "tiktok") {
      authorHandle = pathParts.find((part) => part.startsWith("@")) ?? null;
      const videoIndex = pathParts.findIndex((part) => part === "video" || part === "photo");
      externalPostId = videoIndex >= 0 ? pathParts[videoIndex + 1] ?? null : null;
      fallbackTitle = "TikTok post";
    } else if (provider === "instagram") {
      const typeIndex = pathParts.findIndex((part) => ["p", "reel", "tv"].includes(part));
      externalPostId = typeIndex >= 0 ? pathParts[typeIndex + 1] ?? null : null;
      fallbackTitle = "Instagram post";
    } else if (provider === "telegram") {
      externalPostId = pathParts.length >= 2 ? `${pathParts[0]}/${pathParts[1]}` : pathParts[0] ?? null;
      authorHandle = pathParts[0] ? `@${pathParts[0]}` : null;
      fallbackTitle = "Telegram post";
    } else if (provider === "youtube") {
      externalPostId = host === "youtu.be" ? pathParts[0] ?? null
        : url.searchParams.get("v") ?? (pathParts[0] === "shorts" || pathParts[0] === "embed" ? pathParts[1] ?? null : null);
      fallbackTitle = "YouTube video";
    } else if (provider === "x") {
      const statusIndex = pathParts.findIndex((part) => part === "status");
      externalPostId = statusIndex >= 0 ? pathParts[statusIndex + 1] ?? null : null;
      authorHandle = pathParts[0] ? `@${pathParts[0]}` : null;
      fallbackTitle = "X post";
    }
    const canonical = new URL(url.href);
    for (const key of Array.from(canonical.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || ["fbclid", "gclid", "igshid", "si"].includes(lower)) canonical.searchParams.delete(key);
    }
    canonical.hash = "";
    return { provider, externalUrl: url.href, normalizedUrl: canonical.href, externalPostId, authorHandle, fallbackTitle };
  } catch {
    return null;
  }
}

export async function loadLinkPreview(source: LinkSource): Promise<LinkPreview> {
  if (source.provider === "instagram") return emptyPreview(source);
  const deadlineAt = Date.now() + FETCH_TIMEOUT_MS;
  try {
    const oembedUrl = source.provider === "youtube" ? `https://www.youtube.com/oembed?url=${encodeURIComponent(source.externalUrl)}&format=json`
      : source.provider === "tiktok" ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(source.externalUrl)}` : null;
    if (oembedUrl) {
      const response = await safeGet(new URL(oembedUrl), MAX_HTML_BYTES, deadlineAt);
      if (response.status >= 200 && response.status < 300) {
        const metadata = JSON.parse(response.body.toString("utf8")) as Record<string, unknown>;
        const title = limitedText(metadata.title, 240);
        const authorName = limitedText(metadata.author_name, 120);
        const authorUrl = normalizeSafeExternalPage(metadata.author_url);
        const thumbnailUrl = normalizeSafeExternalPage(metadata.thumbnail_url);
        const safeThumbnail = thumbnailUrl ? await isPublicAddressUrl(new URL(thumbnailUrl), deadlineAt) : false;
        return {
          title,
          description: null,
          authorName: authorName ?? source.authorHandle,
          thumbnailUrl: safeThumbnail ? thumbnailUrl : null,
          canonicalUrl: authorUrl,
          status: title || safeThumbnail ? "ready" : "link_only"
        };
      }
    }
    const response = await safeGet(new URL(source.externalUrl), MAX_HTML_BYTES, deadlineAt);
    if (response.status < 200 || response.status >= 300 || !/^text\/html\b/i.test(response.contentType ?? "")) return emptyPreview(source);
    const html = response.body.toString("utf8");
    const metadata = parseHtmlMetadata(html);
    const thumbnail = metadata.thumbnailUrl ? normalizeSafeExternalPage(metadata.thumbnailUrl) : null;
    const safeThumbnail = thumbnail ? await isPublicAddressUrl(new URL(thumbnail), deadlineAt) : false;
    const title = metadata.title ?? source.fallbackTitle;
    const authorName = metadata.authorName ?? source.authorHandle;
    return {
      title: metadata.title,
      description: metadata.description,
      authorName,
      thumbnailUrl: safeThumbnail ? thumbnail : null,
      canonicalUrl: metadata.canonicalUrl,
      status: metadata.title || metadata.description || safeThumbnail ? "ready" : "link_only"
    };
  } catch {
    return { ...emptyPreview(source), status: "failed" };
  }
}

export async function loadPublicThumbnail(urlValue: string): Promise<{ body: Buffer; contentType: string } | null> {
  const url = normalizeSafeExternalPage(urlValue);
  if (!url) return null;
  const response = await safeGet(new URL(url), MAX_IMAGE_BYTES, Date.now() + FETCH_TIMEOUT_MS);
  const contentType = response.contentType?.split(";")[0].trim().toLowerCase() ?? "";
  if (response.status < 200 || response.status >= 300 || !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(contentType)) return null;
  return { body: response.body, contentType };
}

function emptyPreview(source: LinkSource): LinkPreview {
  return { title: null, description: null, authorName: source.authorHandle, thumbnailUrl: null, canonicalUrl: null, status: "link_only" };
}

function limitedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = decodeHtml(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function parseHtmlMetadata(html: string) {
  const metas = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = readAttribute(tag, "property") ?? readAttribute(tag, "name");
    const value = readAttribute(tag, "content");
    if (key && value) metas.set(key.toLowerCase(), value);
  }
  const rawTitle = metas.get("og:title") ?? metas.get("twitter:title") ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const canonical = html.match(/<link\b[^>]*>/gi)?.find((tag) => (readAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  return {
    title: rawTitle ? limitedText(rawTitle.replace(/<[^>]+>/g, ""), 240) : null,
    description: limitedText(metas.get("og:description") ?? metas.get("description") ?? metas.get("twitter:description"), 500),
    thumbnailUrl: metas.get("og:image:secure_url") ?? metas.get("og:image") ?? metas.get("twitter:image") ?? null,
    authorName: limitedText(metas.get("article:author") ?? metas.get("author"), 120),
    canonicalUrl: canonical ? normalizeSafeExternalPage(readAttribute(canonical, "href")) : null
  };
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : null;
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|#39|lt|gt|nbsp);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "quot") return "\"";
    if (lower === "apos" || lower === "#39") return "'";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "nbsp") return " ";
    const number = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
  });
}

function normalizeSafeExternalPage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && (!url.port || url.port === "80" || url.port === "443") ? url.href : null;
  } catch {
    return null;
  }
}

async function isPublicAddressUrl(url: URL, deadlineAt = Date.now() + FETCH_TIMEOUT_MS): Promise<boolean> {
  try {
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const literalType = isIP(host);
    const addresses = literalType ? [{ address: host, family: literalType }] : await withDeadline(lookup(host, { all: true, verbatim: true }), deadlineAt);
    return addresses.length > 0 && addresses.every(({ address }) => !isNonPublicAddress(address));
  } catch {
    return false;
  }
}

export function isNonPublicAddress(address: string): boolean {
  const lower = address.toLowerCase().split("%", 1)[0];
  if (!lower.includes(":")) return isPrivateIpv4(lower.split(".").map(Number));
  const groups = expandIpv6(lower);
  if (!groups || groups.every((group) => group === 0) || groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  const first = groups[0];
  if ((first & 0xe000) !== 0x2000 || first === 0x2002 || first === 0x2001 && (groups[1] <= 0x01ff || groups[1] === 0x0db8)) return true;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true;
  const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const ipv4Compatible = groups.slice(0, 6).every((group) => group === 0);
  const sixToFour = first === 0x2002;
  const teredo = first === 0x2001 && groups[1] === 0;
  if (ipv4Mapped || ipv4Compatible || sixToFour) {
    const offset = sixToFour ? 1 : 6;
    const embedded = [(groups[offset] >> 8) & 255, groups[offset] & 255, (groups[offset + 1] >> 8) & 255, groups[offset + 1] & 255];
    return isPrivateIpv4(embedded);
  }
  return teredo;
}

function expandIpv6(value: string): number[] | null {
  let input = value;
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    const bytes = input.slice(lastColon + 1).split(".").map(Number);
    if (bytes.length !== 4 || bytes.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    input = `${input.slice(0, lastColon + 1)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").map((group) => Number.parseInt(group, 16)) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").map((group) => Number.parseInt(group, 16)) : [];
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = halves.length === 2 ? [...left, ...Array(Math.max(zeroCount, 0)).fill(0), ...right] : left;
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 65535) ? groups : null;
}

function isPrivateIpv4(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && (b === 0 || b === 2 || b === 88 && parts[2] === 99))
    || (a === 198 && (b === 18 || b === 19 || b === 51 && parts[2] === 100))
    || (a === 203 && b === 0 && parts[2] === 113);
}

async function safeGet(initialUrl: URL, maxBytes = MAX_HTML_BYTES, deadlineAt = Date.now() + FETCH_TIMEOUT_MS) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) {
      throw new Error("Unsupported source URL");
    }
    if (!await isPublicAddressUrl(url, deadlineAt)) throw new Error("Source host does not resolve to a public address");
    const response = await requestPublicUrl(url, maxBytes, deadlineAt);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const locationHeader = response.headers.location;
      const location = Array.isArray(locationHeader) ? locationHeader.length === 1 ? locationHeader[0] : null : locationHeader;
      if (!location || redirects === MAX_REDIRECTS) throw new Error("Too many source redirects");
      url = new URL(location, url);
      continue;
    }
    return response;
  }
  throw new Error("Too many source redirects");
}

function requestPublicUrl(url: URL, maxBytes: number, deadlineAt: number): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; contentType?: string; body: Buffer }> {
  return new Promise(async (resolve, reject) => {
    try {
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const ipFamily = isIP(hostname);
      const addresses = ipFamily ? [{ address: hostname, family: ipFamily }] : await withDeadline(lookup(hostname, { all: true, verbatim: true }), deadlineAt);
      if (!addresses.length || addresses.some(({ address }) => isNonPublicAddress(address))) throw new Error("Source host does not resolve to a public address");
      const selected = addresses[0];
      const pinnedLookup = ((_hostname: string, options: unknown, rawCallback: unknown) => {
        const callback = rawCallback as (error: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void;
        const lookupOptions = options as { all?: boolean } | undefined;
        if (lookupOptions?.all) callback(null, addresses);
        else callback(null, selected.address, selected.family);
      }) as LookupFunction;
      const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
      const requestTimeout = remainingTime(deadlineAt);
      const request = requestFn(url, { method: "GET", headers: { Accept: "text/html,application/json,image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "User-Agent": "OpenAbundance-LinkPreview/1.0" }, agent: false, lookup: pinnedLookup });
      const timer = setTimeout(() => request.destroy(new Error("Source request timed out")), requestTimeout);
      request.on("response", (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += part.length;
          if (size > maxBytes) {
            response.destroy(new Error("Source response is too large"));
            request.destroy(new Error("Source response is too large"));
            return;
          }
          chunks.push(part);
        });
        response.on("end", () => {
          clearTimeout(timer);
          resolve({ status: response.statusCode ?? 502, headers: response.headers, contentType: response.headers["content-type"], body: Buffer.concat(chunks) });
        });
        response.on("error", (error) => { clearTimeout(timer); reject(error); });
      });
      request.on("error", (error) => { clearTimeout(timer); reject(error); });
      request.end();
    } catch (error) {
      reject(error);
    }
  });
}

function remainingTime(deadlineAt: number): number {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error("Source request timed out");
  return remaining;
}

function withDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Source request timed out")), remainingTime(deadlineAt));
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
