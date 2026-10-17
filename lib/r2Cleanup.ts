// Pure rules of the R2 media housekeeping (no imports, tested directly by node).
// An uploaded file belongs to a post only when a media row names its key. A file nobody names after the grace
// period is a leftover (an upload that was signed but never completed, or a replaced file) and can be removed.

export type BucketObject = { key: string; size: number; lastModified: string };

export const ORPHAN_GRACE_HOURS = 24;
/** Cloudflare R2 free tier: 10 GB of storage. */
export const FREE_TIER_BYTES = 10 * 1024 ** 3;

/** The media keys named anywhere in the given rows (media url, thumbnail, metadata). */
export function referencedKeys(rows: unknown[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const text = JSON.stringify(row ?? "");
    for (const match of text.matchAll(/feed\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{8,64}\.(?:jpg|png|webp|mp4)/g)) keys.add(match[0]);
  }
  return keys;
}

export function findOrphans(objects: BucketObject[], referenced: Set<string>, now: Date, graceHours = ORPHAN_GRACE_HOURS): BucketObject[] {
  const limit = now.getTime() - graceHours * 3600 * 1000;
  return objects.filter((object) => {
    if (referenced.has(object.key)) return false;
    const time = Date.parse(object.lastModified);
    return Number.isFinite(time) && time < limit;
  });
}

export type StorageSummary = { files: number; bytes: number; freeTierPercent: number; orphanFiles: number; orphanBytes: number };

export function summarize(objects: BucketObject[], orphans: BucketObject[]): StorageSummary {
  const bytes = objects.reduce((sum, object) => sum + object.size, 0);
  return {
    files: objects.length,
    bytes,
    freeTierPercent: Math.round((bytes / FREE_TIER_BYTES) * 10000) / 100,
    orphanFiles: orphans.length,
    orphanBytes: orphans.reduce((sum, object) => sum + object.size, 0)
  };
}
