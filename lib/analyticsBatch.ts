// Shared limits and parsing for batched analytics events (no imports, tested directly by node).

export const ANALYTICS_BATCH_MAX = 20;

export type ParsedAnalyticsEvent = {
  eventName: string;
  properties: Record<string, string | number | boolean | null>;
};

export function cleanEventName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[a-z][a-z0-9_]{1,63}$/.test(value) ? value : null;
}

export function cleanEventProperties(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const properties: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      properties[key.slice(0, 64)] = typeof entry === "string" ? entry.slice(0, 300) : entry;
    }
  }
  return properties;
}

/**
 * Accepts both the batched body `{ anonymousId, events: [...] }` and the older single-event
 * body `{ anonymousId, eventName, properties }` (still sent by cached app versions).
 */
export function parseAnalyticsEvents(body: unknown): ParsedAnalyticsEvent[] {
  const value = body as { events?: unknown; eventName?: unknown; properties?: unknown } | null;
  if (!value || typeof value !== "object") return [];
  const raw = Array.isArray(value.events) ? value.events.slice(0, ANALYTICS_BATCH_MAX) : [value];
  const events: ParsedAnalyticsEvent[] = [];
  for (const entry of raw) {
    const item = entry as { eventName?: unknown; properties?: unknown } | null;
    const eventName = cleanEventName(item?.eventName);
    if (eventName) events.push({ eventName, properties: cleanEventProperties(item?.properties) });
  }
  return events;
}
