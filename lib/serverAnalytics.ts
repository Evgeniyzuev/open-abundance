import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

type ProductEventInput = {
  anonymousId?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  eventName: string;
  properties?: Record<string, Json | undefined>;
  source?: string;
  userId?: string | null;
};

export async function recordProductEvent(input: ProductEventInput): Promise<void> {
  if (!input.userId && !input.anonymousId) return;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { error } = await supabase.from("product_events").insert({
    anonymous_id: cleanText(input.anonymousId, 128),
    entity_id: cleanUuid(input.entityId),
    entity_type: cleanText(input.entityType, 64),
    event_name: input.eventName,
    properties: input.properties ?? {},
    source: cleanText(input.source, 32) ?? "app",
    user_id: cleanUuid(input.userId)
  });

  if (error) console.warn("Product analytics event was not recorded", input.eventName, error.message);
}

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
