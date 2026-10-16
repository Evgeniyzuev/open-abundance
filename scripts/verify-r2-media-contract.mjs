import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMediaKey, deleteObject, headObject, isOwnMediaKey, MAX_UPLOADS_PER_DAY, presignUpload, presignUrl, publicMediaUrl, readR2Config, validateUploadRequest } from "../lib/r2Media.ts";

// 1. The signer reproduces the example from the AWS documentation ("Authenticating requests: query parameters"),
//    so every presigned URL we hand out is computed by the real SigV4 algorithm.
const aws = presignUrl({
  method: "GET",
  host: "examplebucket.s3.amazonaws.com",
  path: "/test.txt",
  region: "us-east-1",
  service: "s3",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  now: new Date("2013-05-24T00:00:00Z"),
  expiresSeconds: 86400
});
assert.equal(
  aws,
  "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  "matches the AWS reference signature"
);

// 2. R2 settings: all five values or nothing, and the public address must be https.
const full = { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "media", R2_PUBLIC_BASE_URL: "https://pub-x.r2.dev/" };
const config = readR2Config(full);
assert.ok(config && config.publicBaseUrl === "https://pub-x.r2.dev", "a trailing slash is trimmed");
for (const name of Object.keys(full)) assert.equal(readR2Config({ ...full, [name]: "" }), null, `missing ${name} disables direct upload`);
assert.equal(readR2Config({ ...full, R2_PUBLIC_BASE_URL: "http://pub-x.r2.dev" }), null, "a plain http public address is refused");

// 3. Upload rules.
assert.deepEqual(validateUploadRequest({ contentType: "image/jpeg", size: 2_000_000 }), { ok: true, extension: "jpg", kind: "image", maxBytes: 10 * 1024 * 1024 });
assert.equal(validateUploadRequest({ contentType: "image/gif", size: 10 }).ok, false, "gif is not allowed");
assert.equal(validateUploadRequest({ contentType: "image/jpeg", size: 11 * 1024 * 1024 }).ok, false, "a photo above 10 MB is refused");
assert.equal(validateUploadRequest({ contentType: "video/mp4", size: 24 * 1024 * 1024, durationSeconds: 20 }).ok, true);
assert.deepEqual(validateUploadRequest({ contentType: "video/mp4", size: 26 * 1024 * 1024 }), { ok: false, code: "too_large" });
assert.deepEqual(validateUploadRequest({ contentType: "video/mp4", size: 1000, durationSeconds: 31 }), { ok: false, code: "video_too_long" });
assert.deepEqual(validateUploadRequest({ contentType: "image/png", size: 0 }), { ok: false, code: "bad_size" });
assert.deepEqual(validateUploadRequest({ contentType: 5, size: 5 }), { ok: false, code: "type_not_allowed" });
assert.ok(MAX_UPLOADS_PER_DAY >= 1 && MAX_UPLOADS_PER_DAY <= 20, "a daily limit exists");

// 4. Keys belong to one person and one draft; nobody can ask to confirm someone else's file.
const user = "11111111-1111-1111-1111-111111111111";
const post = "22222222-2222-2222-2222-222222222222";
const key = buildMediaKey(user, post, "jpg", "abc12345-def0");
assert.equal(key, `feed/${user}/${post}/abc12345-def0.jpg`);
assert.equal(isOwnMediaKey(key, user, post), true);
assert.equal(isOwnMediaKey(key, "33333333-3333-3333-3333-333333333333", post), false, "another user's key is rejected");
assert.equal(isOwnMediaKey(key, user, "44444444-4444-4444-4444-444444444444"), false, "another draft's key is rejected");
assert.equal(isOwnMediaKey(`feed/${user}/${post}/../x.jpg`, user, post), false, "path tricks are rejected");
assert.equal(isOwnMediaKey(`feed/${user}/${post}/abc12345.exe`, user, post), false, "an unknown extension is rejected");
assert.equal(publicMediaUrl(config, key), `https://pub-x.r2.dev/${key}`);

// 5. The upload URL points at the bucket on the R2 endpoint, signs the content type and lives ten minutes.
const url = new URL(presignUpload(config, key, "image/jpeg", new Date("2026-10-17T10:00:00Z")));
assert.equal(url.host, "acc.r2.cloudflarestorage.com");
assert.equal(url.pathname, `/media/${key}`);
assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host", "the content type is signed");
assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
assert.notEqual(url.search, new URL(presignUpload(config, key, "image/png", new Date("2026-10-17T10:00:00Z"))).search, "another content type gives another signature");
assert.ok(!url.href.includes("secret"), "the secret key is not part of the URL");

// 6. HEAD and DELETE go through signed requests; a missing file is "nothing there", not an error.
const calls = [];
const fake = async (input, init) => { calls.push({ url: String(input), method: init?.method }); return new Response(null, { status: init?.method === "HEAD" ? 200 : 204, headers: { "content-length": "1234", "content-type": "image/jpeg" } }); };
assert.deepEqual(await headObject(config, key, fake), { size: 1234, contentType: "image/jpeg" });
assert.equal(await deleteObject(config, key, fake), true);
assert.deepEqual(calls.map((call) => call.method), ["HEAD", "DELETE"]);
assert.ok(calls.every((call) => call.url.includes("X-Amz-Signature=")), "both requests are signed");
const missing = async () => new Response(null, { status: 404 });
assert.equal(await headObject(config, key, missing), null);
assert.equal(await deleteObject(config, key, missing), true);

// 7. Wiring: the secret stays on the server and the old path stays as the fallback.
const route = readFileSync(new URL("../app/api/social/feed/posts/[postId]/media/direct/route.ts", import.meta.url), "utf8");
assert.ok(route.includes("readR2Config(process.env)") && route.includes("not_configured"), "no settings means a clear 503, not a crash");
assert.ok(route.includes("isOwnMediaKey") && route.includes("headObject"), "completion checks the key and the real object");
const client = readFileSync(new URL("../lib/postMediaUpload.ts", import.meta.url), "utf8");
assert.ok(client.includes("not_configured") && client.includes("/media\`"), "the browser falls back to the old upload while R2 is not configured");
assert.ok(!/R2_SECRET|secretAccessKey/.test(client), "the browser never sees the secret key");
console.log("R2 media contract verified.");
