// One pass of the R2 media housekeeping: list the bucket, find the files no post names, report the used space,
// and (only when asked) delete the leftovers. Imports are relative so the script and the route share it.
import { deleteObject, listObjects, type R2Config } from "./r2Media.ts";
import { findOrphans, referencedKeys, summarize, type StorageSummary } from "./r2Cleanup.ts";

export type HousekeepingResult = StorageSummary & { deleted: number; applied: boolean };

async function readMediaRows(base: string, serviceKey: string): Promise<unknown[]> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const rows: unknown[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const response = await fetch(`${base}/rest/v1/feed_post_media?select=media_url,thumbnail_url,metadata&order=id&offset=${offset}&limit=1000`, { headers });
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Could not read feed_post_media");
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function readAvatarRows(base: string, serviceKey: string): Promise<unknown[]> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const rows: unknown[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const response = await fetch(`${base}/rest/v1/user_profiles?select=avatar_url&avatar_url=not.is.null&order=user_id&offset=${offset}&limit=1000`, { headers });
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Could not read user_profiles");
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

/**
 * Every place a wish picture url can sit: the wish itself (only while it is not deleted) and the tables a wish
 * picture is copied into or can be pasted into. Only rows that mention "/wishes/" are read.
 */
const WISH_IMAGE_SOURCES: Array<{ table: string; column: string; extra?: string }> = [
  { table: "wishes", column: "image_url", extra: "&deleted_at=is.null" },
  { table: "recommended_wishes", column: "image_url" },
  { table: "wish_products", column: "image_url" },
  { table: "projects", column: "image_url" },
  { table: "marketplace_listings", column: "image_url" },
  { table: "user_artifacts", column: "image_url" },
  { table: "challenges", column: "image_url" },
  { table: "feed_post_external_links", column: "thumbnail_url" },
  { table: "feed_post_media", column: "media_url" },
  { table: "feed_posts", column: "body" },
  { table: "user_profiles", column: "avatar_url" }
];

async function readWishImageRows(base: string, serviceKey: string): Promise<unknown[]> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const rows: unknown[] = [];
  for (const source of WISH_IMAGE_SOURCES) {
    for (let offset = 0; offset < 100000; offset += 1000) {
      const response = await fetch(`${base}/rest/v1/${source.table}?select=${source.column}&${source.column}=like.*%2Fwishes%2F*${source.extra ?? ""}&offset=${offset}&limit=1000`, { headers });
      const page = await response.json();
      // Any failed read stops the pass before anything is deleted.
      if (!Array.isArray(page)) throw new Error(`Could not read ${source.table}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
  }
  return rows;
}

export async function runHousekeeping(input: { config: R2Config; supabaseUrl: string; serviceKey: string; apply: boolean; now?: Date }): Promise<HousekeepingResult> {
  const now = input.now ?? new Date();
  // Rows are read after the listing is taken, so a file uploaded in between is never mistaken for a leftover
  // (and the 24-hour grace period covers the rest).
  const objects = [
    ...await listObjects(input.config, "feed/"),
    ...await listObjects(input.config, "avatars/"),
    ...await listObjects(input.config, "wishes/")
  ];
  const referenced = referencedKeys([
    ...await readMediaRows(input.supabaseUrl, input.serviceKey),
    ...await readAvatarRows(input.supabaseUrl, input.serviceKey),
    ...await readWishImageRows(input.supabaseUrl, input.serviceKey)
  ]);
  // A wish picture goes when no live wish and no other row names it: a deleted wish, a replaced picture,
  // or an upload that was never saved (after the same 24-hour grace period).
  const orphans = findOrphans(objects, referenced, now);
  let deleted = 0;
  if (input.apply) for (const orphan of orphans) if (await deleteObject(input.config, orphan.key)) deleted += 1;
  return { ...summarize(objects, orphans), deleted, applied: input.apply };
}
