import { createHash } from "node:crypto";

export type ListingKind = "digital_asset" | "service" | "physical_good";

/** The frozen terms of a listing: what a deal snapshots and both sides accept. */
export function buildTerms({ artifact, description, priceAmount, title, listingKind, fulfillmentDays, category }: {
  artifact: { id: string; title: string | null } | null;
  description: string | null;
  priceAmount: number;
  title: string;
  listingKind: ListingKind;
  fulfillmentDays: number | null;
  category: string | null;
}) {
  return {
    artifactId: artifact?.id ?? null,
    artifactTitle: artifact?.title ?? null,
    category,
    currencyCode: "$",
    description,
    fulfillmentDays,
    listingKind,
    priceAmount,
    title,
    version: 1
  };
}

export function hashTerms(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
