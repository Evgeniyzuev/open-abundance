import assert from "node:assert/strict";
import { copyExternalImage, directImageUrl, shouldCopyExternalImage, sniffImageType } from "../lib/externalImageCopy.ts";

const base = "https://pub-test.r2.dev";
assert.equal(shouldCopyExternalImage("https://i.imgur.com/a.jpg", base), true);
assert.equal(shouldCopyExternalImage("https://pub-test.r2.dev/wishes/u/a.jpg", base), false, "our own bucket");
assert.equal(shouldCopyExternalImage("/feed/system-events/x.png", base), false, "app path");
assert.equal(shouldCopyExternalImage("https://i.pinimg.com/1200x/a.jpg", base), false, "Pinterest stays for now");
assert.equal(shouldCopyExternalImage("http://127.0.0.1/a.jpg", base), false, "private address");
assert.equal(shouldCopyExternalImage("http://localhost:3000/a.jpg", base), false);
assert.equal(shouldCopyExternalImage("ftp://x/a.jpg", base), false);
assert.equal(directImageUrl("https://drive.google.com/file/d/ABC/view?usp=sharing"), "https://drive.google.com/uc?export=download&id=ABC");
assert.deepEqual(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), { contentType: "image/jpeg", extension: "jpg" });
assert.equal(sniffImageType(new TextEncoder().encode("<html>")), null);

const config = { accountId: "acc", accessKeyId: "id", secretAccessKey: "secret", bucket: "b", publicBaseUrl: base };
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
let put = null;
const fakeFetch = async (input, init) => {
  if (init?.method === "PUT") { put = String(input); return new Response(null, { status: 200 }); }
  if (String(input).includes("page.html")) return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  return new Response(jpeg, { headers: { "content-type": "application/octet-stream" } });
};
const copied = await copyExternalImage(config, "https://example.com/pic", "wishes/u1", fakeFetch);
assert.match(copied, /^https:\/\/pub-test\.r2\.dev\/wishes\/u1\/[0-9a-f-]+\.jpg$/);
assert.ok(put && put.includes("wishes/u1/"));
assert.equal(await copyExternalImage(config, "https://example.com/page.html", "wishes/u1", fakeFetch), null, "not a picture: keep the link");
assert.equal(await copyExternalImage(config, "https://i.pinimg.com/a.jpg", "wishes/u1", fakeFetch), null);
console.log("external image copy contract ok");
