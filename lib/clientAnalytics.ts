import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

export type ClientAnalyticsProperties = Record<string, string | number | boolean | null>;

export async function trackClientEvent(
  eventName: string,
  properties: ClientAnalyticsProperties = {}
): Promise<boolean> {
  try {
    const guest = await getOrCreateLocalGuest();
    const supabase = getBrowserSupabaseClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    const response = await fetch("/api/analytics/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({
        anonymousId: guest.guestId,
        eventName,
        properties
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}
