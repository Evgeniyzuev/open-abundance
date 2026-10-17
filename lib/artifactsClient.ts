import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { ArtifactKey, UnlockedArtifact } from "@/lib/artifacts";

/** Fired after a challenge check succeeds, so the new artifact appears without waiting for the next poll. */
export const ARTIFACTS_CHECK_EVENT = "open-abundance:artifacts-check";

export async function loadArtifacts(): Promise<UnlockedArtifact[]> {
  const response = await fetchWithSupabaseAuth(`/api/artifacts?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
  const payload = (await response.json().catch(() => ({}))) as { artifacts?: UnlockedArtifact[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load artifacts.");
  return payload.artifacts ?? [];
}

const seenKey = (userId: string) => `oa.artifacts.seen.v1.${userId}`;

/** The artifacts already announced on this device; null when nothing was ever recorded for this person. */
export function readSeenArtifacts(userId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(seenKey(userId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : null;
  } catch {
    return null;
  }
}

export function writeSeenArtifacts(userId: string, keys: Array<ArtifactKey | string>): void {
  try {
    window.localStorage.setItem(seenKey(userId), JSON.stringify([...new Set(keys)]));
  } catch {
    // Without storage the same artifact may be announced again after a reload; nothing is lost.
  }
}
