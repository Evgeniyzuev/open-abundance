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

export async function runHousekeeping(input: { config: R2Config; supabaseUrl: string; serviceKey: string; apply: boolean; now?: Date }): Promise<HousekeepingResult> {
  const now = input.now ?? new Date();
  // Rows are read after the listing is taken, so a file uploaded in between is never mistaken for a leftover
  // (and the 24-hour grace period covers the rest).
  const objects = await listObjects(input.config, "feed/");
  const referenced = referencedKeys(await readMediaRows(input.supabaseUrl, input.serviceKey));
  const orphans = findOrphans(objects, referenced, now);
  let deleted = 0;
  if (input.apply) for (const orphan of orphans) if (await deleteObject(input.config, orphan.key)) deleted += 1;
  return { ...summarize(objects, orphans), deleted, applied: input.apply };
}
