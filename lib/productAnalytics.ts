import { getOrCreateLocalGuest } from "@/lib/guestIdentity";

const ANALYTICS_ID_KEY = "open-abundance-analytics-id";

export function trackProductEvent(eventName: string, properties: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === "undefined") return;
  void getOrCreateLocalGuest()
    .then((guest) => sendProductEvent(guest.guestId, eventName, properties))
    .catch(() => sendProductEvent(getAnonymousId(), eventName, properties));
}

function sendProductEvent(anonymousId: string, eventName: string, properties: Record<string, string | number | boolean | null>): Promise<void> {
  return fetch("/api/analytics/events", {
    body: JSON.stringify({ anonymousId, eventName, properties }),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST"
  }).then(() => undefined).catch(() => undefined);
}

function getAnonymousId(): string {
  const existing = window.localStorage.getItem(ANALYTICS_ID_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(ANALYTICS_ID_KEY, value);
  return value;
}
