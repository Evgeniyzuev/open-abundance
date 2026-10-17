import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findOrphans, referencedKeys, summarize, FREE_TIER_BYTES } from "../lib/r2Cleanup.ts";
import { listObjects } from "../lib/r2Media.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const user = "11111111-1111-4111-8111-111111111111";
const post = "22222222-2222-4222-8222-222222222222";
const key = (name) => `feed/${user}/${post}/${name}.jpg`;
const now = new Date("2026-10-17T12:00:00Z");

// Keys are found wherever a row names them.
const named = referencedKeys([{ media_url: `https://x.r2.dev/${key("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")}`, metadata: { key: key("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") } }, null, { thumbnail_url: null }]);
assert.equal(named.size, 2);

// Orphans: not named and older than the grace period; fresh uploads are never touched.
const objects = [
  { key: key("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), size: 100, lastModified: "2026-10-01T00:00:00.000Z" },
  { key: key("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), size: 300, lastModified: "2026-10-10T00:00:00.000Z" },
  { key: key("dddddddd-dddd-4ddd-8ddd-dddddddddddd"), size: 50, lastModified: "2026-10-17T06:00:00.000Z" },
  { key: key("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"), size: 5, lastModified: "bad date" }
];
const orphans = findOrphans(objects, named, now);
assert.deepEqual(orphans.map((item) => item.size), [300], "only the old unnamed file is a leftover");
const summary = summarize(objects, orphans);
assert.equal(summary.files, 4);
assert.equal(summary.bytes, 455);
assert.equal(summary.orphanBytes, 300);
assert.equal(summary.freeTierPercent, Math.round((455 / FREE_TIER_BYTES) * 10000) / 100);

// Listing parses pages and the continuation token, and signs the prefix.
const pages = [
  `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok&amp;1</NextContinuationToken><Contents><Key>feed/a.jpg</Key><LastModified>2026-10-01T00:00:00.000Z</LastModified><Size>10</Size></Contents></ListBucketResult>`,
  `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>feed/b&amp;c.jpg</Key><LastModified>2026-10-02T00:00:00.000Z</LastModified><Size>20</Size></Contents></ListBucketResult>`
];
const urls = [];
const fake = async (url) => { urls.push(String(url)); return new Response(pages[urls.length - 1], { status: 200 }); };
const listed = await listObjects({ accountId: "acc", accessKeyId: "k", secretAccessKey: "s", bucket: "b", publicBaseUrl: "https://p.r2.dev" }, "feed/", fake);
assert.deepEqual(listed.map((item) => [item.key, item.size]), [["feed/a.jpg", 10], ["feed/b&c.jpg", 20]]);
assert.ok(urls[0].includes("prefix=feed%2F") && urls[0].includes("list-type=2") && urls[0].includes("X-Amz-Signature="));
assert.ok(urls[1].includes("continuation-token=tok%261"), "the second page asks with the token");
await assert.rejects(listObjects({ accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "b", publicBaseUrl: "x" }, "feed/", async () => new Response("no", { status: 403 })), /listing failed/);

// Wiring: the route needs the secret, the cron is scheduled, and nothing is deleted without apply.
const route = read("app/api/internal/media/r2-housekeeping/route.ts");
assert.ok(route.includes("CRON_SECRET") && route.includes("401"), "the route is closed without the secret");
assert.ok(JSON.parse(read("vercel.json")).crons.some((cron) => cron.path === "/api/internal/media/r2-housekeeping"), "the cron is scheduled");
assert.ok(read("lib/r2Housekeeping.ts").includes("if (input.apply)"), "leftovers are deleted only on apply");
console.log("R2 housekeeping contract verified.");
