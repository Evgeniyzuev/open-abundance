// Shared contract for packaged Market offers (no imports, tested directly by node).
// AI and the static catalog only fill the form; the person sets the price and publishes.

export const MARKET_TEMPLATE_COUNT = 10;
export const MAX_SKILL_TEXT = 600;
export const FULFILLMENT_DAYS = [1, 3, 7, 14] as const;

export type ListingKind = "digital_asset" | "service" | "physical_good";

export type MarketTemplate = {
  /** Number used for the i18n keys marketTemplate.{n}.title / .description. */
  n: number;
  listingKind: ListingKind;
  fulfillmentDays: (typeof FULFILLMENT_DAYS)[number];
};

/** Level-one offers with a clear, small scope. Texts live in the shared dictionary. */
export const MARKET_TEMPLATES: MarketTemplate[] = [
  { n: 1, listingKind: "service", fulfillmentDays: 1 },
  { n: 2, listingKind: "service", fulfillmentDays: 1 },
  { n: 3, listingKind: "service", fulfillmentDays: 3 },
  { n: 4, listingKind: "service", fulfillmentDays: 1 },
  { n: 5, listingKind: "service", fulfillmentDays: 3 },
  { n: 6, listingKind: "service", fulfillmentDays: 3 },
  { n: 7, listingKind: "service", fulfillmentDays: 1 },
  { n: 8, listingKind: "service", fulfillmentDays: 3 },
  { n: 9, listingKind: "digital_asset", fulfillmentDays: 1 },
  { n: 10, listingKind: "service", fulfillmentDays: 7 }
];

export type ListingDraft = {
  title: string;
  description: string;
  listingKind: ListingKind;
  fulfillmentDays: (typeof FULFILLMENT_DAYS)[number];
};

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength) : "";
}

/** Keeps a usable draft within the form limits; the nearest allowed delivery time is used. */
export function normalizeListingDraft(value: unknown): ListingDraft | null {
  const raw = value as { title?: unknown; description?: unknown; listingKind?: unknown; fulfillmentDays?: unknown } | null;
  const title = clean(raw?.title, 120);
  const description = clean(raw?.description, 1000);
  if (!title || !description) return null;
  const listingKind: ListingKind = raw?.listingKind === "digital_asset" || raw?.listingKind === "physical_good" ? raw.listingKind : "service";
  const days = Number(raw?.fulfillmentDays);
  const fulfillmentDays = FULFILLMENT_DAYS.reduce((best, option) => (Math.abs(option - days) < Math.abs(best - days) ? option : best), 7 as (typeof FULFILLMENT_DAYS)[number]);
  return { title, description, listingKind, fulfillmentDays: Number.isFinite(days) ? fulfillmentDays : 7 };
}

export function isListingDraft(value: unknown): value is ListingDraft {
  const raw = value as ListingDraft | null;
  return Boolean(raw) && typeof raw?.title === "string" && typeof raw?.description === "string";
}
