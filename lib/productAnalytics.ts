import { enqueueAnalyticsEvent } from "@/lib/analyticsQueue";

/** Fire-and-forget product event; sent in a batch with other events. */
export function trackProductEvent(eventName: string, properties: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === "undefined") return;
  void enqueueAnalyticsEvent(eventName, properties);
}
