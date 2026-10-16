// One-off (and re-runnable) move of feed media from Supabase Storage to Cloudflare R2.
//
//   node --experimental-strip-types scripts/migrate-feed-media-to-r2.mjs            # dry run: only prints the plan
//   node --experimental-strip-types scripts/migrate-feed-media-to-r2.mjs --apply     # copy, verify, repoint the rows
//   node --experimental-strip-types scripts/migrate-feed-media-to-r2.mjs --apply --delete-old   # also remove the Supabase copies
//
// It reads SUPABASE_SERVICE_ROLE_KEY and the Supabase URL plus the five R2_* values from `.env` (never printed).
// Each file is copied, its size is checked in the bucket, and only then is the database row repointed, so a
// failure leaves the post with its old working file. A file is deleted from Supabase only with --delete-old.

import { readFileSync } from "node:fs";
import { deleteObject, headObject, MEDIA_TYPES, presignUpload, publicMediaUrl, readR2Config } from "../lib/r2Media.ts";

const apply = process.argv.includes("--apply");
const deleteOld = process.argv.includes("--delete-old");

const env = { ...process.env };
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}
const base = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("Supabase URL or service role key is missing in .env");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const config = readR2Config(env);
if (apply && !config) throw new Error("The five R2_* values must be in .env to apply (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL)");

const rowsResponse = await fetch(`${base}/rest/v1/feed_post_media?select=id,post_id,media_type,media_url,storage_path,metadata&storage_path=not.is.null`, { headers });
const rows = await rowsResponse.json();
if (!Array.isArray(rows)) throw new Error(`Could not read feed_post_media: ${JSON.stringify(rows).slice(0, 200)}`);
console.log(`${rows.length} media row(s) still point to Supabase Storage. Mode: ${apply ? (deleteOld ? "apply + delete old" : "apply") : "dry run"}`);

let moved = 0;
for (const row of rows) {
  const path = row.storage_path;
  const [userId, postId] = path.split("/");
  const extension = (path.split(".").pop() || "").toLowerCase();
  const contentType = Object.entries(MEDIA_TYPES).find(([, rule]) => rule.extension === extension)?.[0];
  if (!userId || !postId || !contentType) {
    console.log(`- skip row ${row.id.slice(0, 8)}: unexpected path or type`);
    continue;
  }
  const newKey = `feed/${userId}/${postId}/${crypto.randomUUID()}.${extension}`;
  console.log(`- row ${row.id.slice(0, 8)}: ${contentType}, ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<uuid>")} -> ${newKey.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<uuid>")}`);
  if (!apply) continue;

  const download = await fetch(`${base}/storage/v1/object/feed-media/${path.split("/").map(encodeURIComponent).join("/")}`, { headers });
  if (!download.ok) { console.log(`  ! download failed (${download.status}), left as is`); continue; }
  const bytes = new Uint8Array(await download.arrayBuffer());

  const put = await fetch(presignUpload(config, newKey, contentType), { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
  if (!put.ok) { console.log(`  ! upload to R2 failed (${put.status}), left as is`); continue; }
  const stored = await headObject(config, newKey);
  if (!stored || stored.size !== bytes.length) { console.log("  ! the copy in R2 does not match, removing it, left as is"); await deleteObject(config, newKey); continue; }

  const metadata = { ...(row.metadata ?? {}), origin: "r2", key: newKey, contentType, size: bytes.length, uploaderUserId: userId, movedFromSupabase: true };
  const update = await fetch(`${base}/rest/v1/feed_post_media?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ media_url: publicMediaUrl(config, newKey), storage_path: null, metadata })
  });
  if (!update.ok) { console.log(`  ! database update failed (${update.status}), removing the copy, left as is`); await deleteObject(config, newKey); continue; }
  moved += 1;
  console.log("  ok: copied, verified, row repointed");

  if (deleteOld) {
    const removed = await fetch(`${base}/storage/v1/object/feed-media/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE", headers });
    console.log(removed.ok ? "  old Supabase file removed" : `  ! could not remove the old file (${removed.status})`);
  }
}
console.log(apply ? `Done: ${moved} of ${rows.length} moved.` : "Dry run finished, nothing was changed.");
