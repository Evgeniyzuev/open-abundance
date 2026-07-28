import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_URL_LENGTH = 2048;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const DEFAULT_AVATAR_POSITION = "50% 50%";
const BUCKET = "profile-avatars";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = await readJsonBody(request);
    const rawAvatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
    const avatarUrl = normalizePublicImageUrl(rawAvatarUrl);
    const avatarPosition = normalizeAvatarPosition(body.avatarPosition);
    const validationError = await validatePublicImageUrl(avatarUrl);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: current, error: currentError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: profile, error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: avatarUrl, avatar_position: avatarPosition, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const previousPath = getStoredPath(current.avatar_url);
    if (previousPath) await supabase.storage.from(BUCKET).remove([previousPath]);
    return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to save avatar." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const { data: current, error: currentError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: profile, error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: null, avatar_position: DEFAULT_AVATAR_POSITION, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const previousPath = getStoredPath(current.avatar_url);
    if (previousPath) await supabase.storage.from(BUCKET).remove([previousPath]);
    return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to remove avatar." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function getStoredPath(value: string | null): string | null {
  if (!value) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const pathname = new URL(value).pathname;
    if (!pathname.includes(marker)) return null;
    const path = pathname.slice(pathname.indexOf(marker) + marker.length);
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

async function validatePublicImageUrl(value: string): Promise<string | null> {
  if (!value) return "Paste a public image URL.";
  if (value.length > MAX_URL_LENGTH) return "The image URL is too long.";

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Use a complete image URL starting with https://.";
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    return "Use a public http:// or https:// image URL.";
  }
  if (isPrivateHostname(parsed.hostname)) return "This image host is not publicly reachable.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    let response = await fetch(parsed.toString(), { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (!response.ok || !isImageContentType(response.headers.get("content-type"))) {
      await response.body?.cancel();
      response = await fetch(parsed.toString(), {
        method: "GET",
        headers: { Range: "bytes=0-1023" },
        redirect: "follow",
        signal: controller.signal
      });
    }
    const contentType = response.headers.get("content-type");
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    const driveDownload = isGoogleDriveHost(parsed.hostname) && !isImageContentType(contentType)
      ? await hasImageSignature(response)
      : false;
    await response.body?.cancel();
    if (!response.ok) return "The image link could not be opened publicly.";
    if (!isImageContentType(contentType) && !driveDownload) return "The link must point directly to a JPEG, PNG, WebP, GIF, or AVIF image.";
    if (contentLength > MAX_IMAGE_SIZE) return "The image must be 8 MB or smaller.";
    return null;
  } catch {
    return "The image link could not be checked. Make sure it opens without signing in.";
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePublicImageUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!isGoogleDriveHost(parsed.hostname)) return value;

    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    const fileId = pathMatch?.[1] ?? parsed.searchParams.get("id");
    if (!fileId) return value;
    const resourceKey = parsed.searchParams.get("resourcekey");
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}${resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : ""}`;
  } catch {
    return value;
  }
}

function normalizeAvatarPosition(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AVATAR_POSITION;
  const match = value.trim().match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  if (!match) return DEFAULT_AVATAR_POSITION;
  const x = Math.min(Math.max(Number(match[1]), 0), 100);
  const y = Math.min(Math.max(Number(match[2]), 0), 100);
  return `${x}% ${y}%`;
}

function isGoogleDriveHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "drive.google.com" || host === "drive.usercontent.google.com";
}

async function hasImageSignature(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  try {
    const { value } = await reader.read();
    if (!value || value.length < 4) return false;
    if (value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return true;
    if (value[0] === 0x89 && value[1] === 0x50 && value[2] === 0x4e && value[3] === 0x47) return true;
    if (value[0] === 0x47 && value[1] === 0x49 && value[2] === 0x46 && value[3] === 0x38) return true;
    if (value[0] === 0x52 && value[1] === 0x49 && value[2] === 0x46 && value[3] === 0x46) {
      return value.length >= 12 && value[8] === 0x57 && value[9] === 0x45 && value[10] === 0x42 && value[11] === 0x50;
    }
    if (value.length >= 12 && value[4] === 0x66 && value[5] === 0x74 && value[6] === 0x79 && value[7] === 0x70) {
      return (value[8] === 0x61 && value[9] === 0x76 && value[10] === 0x69 && value[11] === 0x66)
        || (value[8] === 0x61 && value[9] === 0x76 && value[10] === 0x69 && value[11] === 0x73);
    }
    return false;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function isImageContentType(value: string | null): boolean {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return Boolean(mimeType && ALLOWED_IMAGE_TYPES.has(mimeType));
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/[\[\]]/g, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every((part) => Number.isInteger(part)) && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
