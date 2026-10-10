/**
 * Remembers on this device which items were already reported, so a passive event such as a
 * story impression is written once per person and item instead of on every page load.
 * Storage failures fall back to reporting, which only costs an extra row.
 */
const MAX_REMEMBERED = 500;

export function hasBeenSeen(scope: string, id: string): boolean {
  return read(scope).includes(id);
}

export function markSeen(scope: string, id: string): void {
  try {
    const seen = read(scope).filter((item) => item !== id);
    seen.push(id);
    window.localStorage.setItem(storageKey(scope), JSON.stringify(seen.slice(-MAX_REMEMBERED)));
  } catch {
    // Reporting again later is acceptable when storage is unavailable.
  }
}

function read(scope: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(scope)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function storageKey(scope: string): string {
  return `openAbundanceSeen.v1.${scope}`;
}
