import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { ANALYTICS_BATCH_MAX } from "@/lib/analyticsBatch";

/**
 * Client analytics queue: events are sent in one request every few seconds (or when
 * the batch is full, or when the page is hidden) instead of one request per event.
 */

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

type QueuedEvent = {
  eventName: string;
  properties: AnalyticsProperties;
  resolve: (accepted: boolean) => void;
};

const FLUSH_DELAY_MS = 10_000;
const ANALYTICS_ID_KEY = "open-abundance-analytics-id";

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let anonymousId: string | null = null;
let accessToken: string | null = null;
let listening = false;

/** Queues one event; resolves with whether the server accepted the batch it was sent in. */
export function enqueueAnalyticsEvent(eventName: string, properties: AnalyticsProperties = {}): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  listenForPageExit();
  if (!anonymousId) void refreshIdentity();
  return new Promise((resolve) => {
    queue.push({ eventName, properties, resolve });
    if (queue.length >= ANALYTICS_BATCH_MAX) void flushAnalytics();
    else if (timer === null) timer = setTimeout(() => void flushAnalytics(), FLUSH_DELAY_MS);
  });
}

/** Sends everything queued. On page exit it does not wait for identity lookups. */
export async function flushAnalytics(options: { leaving?: boolean } = {}): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  if (!options.leaving) await refreshIdentity();
  const id = anonymousId ?? fallbackAnonymousId();

  while (queue.length > 0) {
    const batch = queue.splice(0, ANALYTICS_BATCH_MAX);
    const sent = fetch("/api/analytics/events", {
      body: JSON.stringify({ anonymousId: id, events: batch.map(({ eventName, properties }) => ({ eventName, properties })) }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      keepalive: true,
      method: "POST"
    }).then((response) => response.ok).catch(() => false);
    if (options.leaving) void sent.then((accepted) => batch.forEach((event) => event.resolve(accepted)));
    else {
      const accepted = await sent;
      batch.forEach((event) => event.resolve(accepted));
    }
  }
}

async function refreshIdentity(): Promise<void> {
  if (!anonymousId) {
    try {
      anonymousId = (await getOrCreateLocalGuest()).guestId;
    } catch {
      anonymousId = fallbackAnonymousId();
    }
  }
  try {
    const { data: { session } } = await getBrowserSupabaseClient().auth.getSession();
    accessToken = session?.access_token ?? null;
  } catch {
    // Anonymous funnel events are still recorded without a session.
  }
}

function listenForPageExit(): void {
  if (listening) return;
  listening = true;
  const leave = () => void flushAnalytics({ leaving: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
  });
  window.addEventListener("pagehide", leave);
}

function fallbackAnonymousId(): string {
  try {
    const existing = window.localStorage.getItem(ANALYTICS_ID_KEY);
    if (existing) return existing;
    const value = crypto.randomUUID();
    window.localStorage.setItem(ANALYTICS_ID_KEY, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}
