import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readJsonSafe, UPLOAD_SAFE_BYTES, UploadTooLargeError } from "../lib/uploadImage.ts";

// The Safari bug: a plain-text 413 from the platform must not be parsed as JSON.
const platformAnswer = new Response("Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE", { status: 413 });
assert.deepEqual(await readJsonSafe(platformAnswer), { error: "upload_too_large" }, "a too-large body becomes a clear code");
assert.deepEqual(await readJsonSafe(new Response("<html>Bad gateway</html>", { status: 502 })), { error: "http_502" }, "other non-JSON answers become a status code");
assert.deepEqual(await readJsonSafe(new Response(null, { status: 204 })), { error: "http_204" }, "an empty body does not throw");
assert.deepEqual(await readJsonSafe(new Response(JSON.stringify({ ok: true, id: "x" }), { status: 200 })), { ok: true, id: "x" }, "JSON passes through");
assert.deepEqual(await readJsonSafe(new Response(JSON.stringify({ error: "Draft not found." }), { status: 404 })), { error: "Draft not found." }, "a JSON error keeps its text");
assert.deepEqual(await readJsonSafe(new Response("123", { status: 200 })), { error: "http_200" }, "a bare JSON scalar is not an object payload");

assert.ok(UPLOAD_SAFE_BYTES < 4.5 * 1024 * 1024, "the safe size is below the platform's 4.5 MB request limit");
assert.equal(new UploadTooLargeError().message, "upload_too_large");

// The Reality day upload shrinks photos first and reads every answer safely.
const card = readFileSync(new URL("../components/RealityDayCard.tsx", import.meta.url), "utf8");
assert.ok(card.includes("uploadPostMedia(draft.id, file)"), "the day post uploads through the shared helper");
const helper = readFileSync(new URL("../lib/postMediaUpload.ts", import.meta.url), "utf8");
assert.ok(helper.includes("prepareUpload(file"), "the photo is prepared before upload");
assert.ok(!/await \w+Response\.json\(\)|await response\.json\(\) as \{ error\?: string \}/.test(card.slice(card.indexOf("async function publish()"))), "publish never calls response.json directly");
const ru = readFileSync(new URL("../lib/messages/ru.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../lib/messages/en.ts", import.meta.url), "utf8");
for (const key of ["reality.day.fileTooLarge", "reality.day.uploadFailed"]) assert.ok(ru.includes(`"${key}":`) && en.includes(`"${key}":`), `both languages have ${key}`);
console.log("Upload image contract verified.");
