// Cloudflare R2 media storage: SigV4 presigned URLs and the upload rules (no project imports, so node tests it
// directly). Only the server uses it: the secret key never leaves the server, the browser gets one short-lived
// signed URL and uploads straight to the bucket, so Vercel's 4.5 MB request limit does not apply.

import { createHash, createHmac } from "node:crypto";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

/** Reads the R2 settings from the environment; null while any of them is missing (the old upload path is used then). */
export function readR2Config(env: Record<string, string | undefined>): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  if (!/^https:\/\//.test(publicBaseUrl)) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

// ---- upload rules ------------------------------------------------------------------------------

export const MEDIA_TYPES: Record<string, { extension: string; kind: "image" | "video"; maxBytes: number }> = {
  "image/jpeg": { extension: "jpg", kind: "image", maxBytes: 10 * 1024 * 1024 },
  "image/png": { extension: "png", kind: "image", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { extension: "webp", kind: "image", maxBytes: 10 * 1024 * 1024 },
  "video/mp4": { extension: "mp4", kind: "video", maxBytes: 25 * 1024 * 1024 }
};
export const MAX_VIDEO_SECONDS = 30;
/** A person can add at most this many files a day, so the free storage is not drained. */
export const MAX_UPLOADS_PER_DAY = 6;
/** The signed URL lives for ten minutes: enough for a phone on a slow network, too short to be passed around. */
export const SIGNED_URL_SECONDS = 600;

export type UploadCheck = { ok: true; extension: string; kind: "image" | "video"; maxBytes: number } | { ok: false; code: "type_not_allowed" | "too_large" | "bad_size" | "video_too_long" };

export function validateUploadRequest(input: { contentType: unknown; size: unknown; durationSeconds?: unknown }): UploadCheck {
  const rule = typeof input.contentType === "string" ? MEDIA_TYPES[input.contentType] : undefined;
  if (!rule) return { ok: false, code: "type_not_allowed" };
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: "bad_size" };
  if (size > rule.maxBytes) return { ok: false, code: "too_large" };
  if (rule.kind === "video") {
    const duration = Number(input.durationSeconds);
    if (Number.isFinite(duration) && duration > MAX_VIDEO_SECONDS) return { ok: false, code: "video_too_long" };
  }
  return { ok: true, extension: rule.extension, kind: rule.kind, maxBytes: rule.maxBytes };
}

export function buildMediaKey(userId: string, postId: string, extension: string, uniqueId: string): string {
  return `feed/${userId}/${postId}/${uniqueId}.${extension}`;
}

/** A key is accepted only when it was issued for this person and this draft. */
export function isOwnMediaKey(key: unknown, userId: string, postId: string): key is string {
  if (typeof key !== "string") return false;
  const prefix = `feed/${userId}/${postId}/`;
  return key.startsWith(prefix) && /^[0-9a-f-]{8,64}\.(jpg|png|webp|mp4)$/.test(key.slice(prefix.length));
}

export function publicMediaUrl(config: R2Config, key: string): string {
  return `${config.publicBaseUrl}/${key}`;
}

// ---- SigV4 query-string signing ----------------------------------------------------------------

export type PresignInput = {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  host: string;
  path: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
  expiresSeconds: number;
  /** Extra headers the browser must send unchanged (for example content-type); they are part of the signature. */
  signedHeaders?: Record<string, string>;
  /** Extra query parameters (for example the listing's prefix); they are part of the signature. */
  query?: Record<string, string>;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (path: string) => path.split("/").map(encode).join("/");

export function presignUrl(input: PresignInput): string {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;

  const headers: Record<string, string> = { host: input.host };
  for (const [name, value] of Object.entries(input.signedHeaders ?? {})) headers[name.toLowerCase()] = value;
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
    ...(input.query ?? {})
  };
  const canonicalQuery = Object.keys(query).sort().map((name) => `${encode(name)}=${encode(query[name])}`).join("&");
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const canonicalRequest = [input.method, encodePath(input.path), canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `https://${input.host}${encodePath(input.path)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function objectRequest(config: R2Config, key: string, method: PresignInput["method"], extra: Partial<PresignInput>, now: Date): string {
  return presignUrl({
    method,
    host: `${config.accountId}.r2.cloudflarestorage.com`,
    path: `/${config.bucket}/${key}`,
    region: "auto",
    service: "s3",
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    now,
    expiresSeconds: SIGNED_URL_SECONDS,
    ...extra
  });
}

/** A URL the browser PUTs the file to; the content type is part of the signature, so another type is refused. */
export function presignUpload(config: R2Config, key: string, contentType: string, now = new Date()): string {
  return objectRequest(config, key, "PUT", { signedHeaders: { "content-type": contentType } }, now);
}

/** What the bucket really holds for a key, or null when nothing was uploaded. */
export async function headObject(config: R2Config, key: string, fetchImpl: typeof fetch = fetch): Promise<{ size: number; contentType: string } | null> {
  const response = await fetchImpl(objectRequest(config, key, "HEAD", {}, new Date()), { method: "HEAD" });
  if (!response.ok) return null;
  return { size: Number(response.headers.get("content-length") ?? 0), contentType: response.headers.get("content-type") ?? "" };
}

/** Removes an object; a missing object is not an error. */
export async function deleteObject(config: R2Config, key: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const response = await fetchImpl(objectRequest(config, key, "DELETE", {}, new Date()), { method: "DELETE" });
  return response.ok || response.status === 404;
}

/** Uploads bytes from the server (for the routes that receive a small file themselves). */
export async function putObject(config: R2Config, key: string, body: ArrayBuffer | Uint8Array, contentType: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const response = await fetchImpl(presignUpload(config, key, contentType), { method: "PUT", headers: { "Content-Type": contentType }, body: body as BodyInit });
  return response.ok;
}

export type StoredObject = { key: string; size: number; lastModified: string };

/** Every object under a prefix (the bucket is listed page by page, 1000 at a time). */
export async function listObjects(config: R2Config, prefix: string, fetchImpl: typeof fetch = fetch): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let token = "";
  for (let page = 0; page < 200; page += 1) {
    const query: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const url = presignUrl({
      method: "GET",
      host: `${config.accountId}.r2.cloudflarestorage.com`,
      path: `/${config.bucket}`,
      region: "auto",
      service: "s3",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      now: new Date(),
      expiresSeconds: SIGNED_URL_SECONDS,
      query
    });
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`R2 listing failed (${response.status})`);
    const xml = await response.text();
    for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
      const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
      if (!key) continue;
      objects.push({ key: decodeXml(key), size: Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0), lastModified: block.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? "" });
    }
    const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
    if (!next || !/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    token = decodeXml(next);
  }
  return objects;
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
