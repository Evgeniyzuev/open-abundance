import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

const ANALYTICS_ID_KEY = "open-abundance-analytics-id";

export function trackProductEvent(eventName: string, properties: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === "undefined") return;
  void getOrCreateLocalGuest()
    .then((guest) => sendProductEvent(guest.guestId, eventName, properties))
    .catch(() => sendProductEvent(getAnonymousId(), eventName, properties));
}

async function sendProductEvent(anonymousId: string, eventName: string, properties: Record<string, string | number | boolean | null>): Promise<void> {
  let accessToken: string | null = null;
  try {
    const { data: { session } } = await getBrowserSupabaseClient().auth.getSession();
    accessToken = session?.access_token ?? null;
  } catch {
    // Anonymous funnel events should still be recorded if auth state is unavailable.
  }

  await fetch("/api/analytics/events", {
    body: JSON.stringify({ anonymousId, eventName, properties }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
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
