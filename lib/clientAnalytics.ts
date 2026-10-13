import { enqueueAnalyticsEvent, type AnalyticsProperties } from "@/lib/analyticsQueue";

export type ClientAnalyticsProperties = AnalyticsProperties;

/** Queues an event; resolves once its batch is accepted (within about ten seconds). */
export function trackClientEvent(eventName: string, properties: ClientAnalyticsProperties = {}): Promise<boolean> {
  return enqueueAnalyticsEvent(eventName, properties);
}
