// Server-side reads for the public marketplace pages (/m). Uses the service client, so it selects only
// fields that are safe to show to anyone: no seller ids, contacts, deals or balances.
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isHiddenFromGuests, isIndexableListing } from "@/lib/marketplaceGuestVisibility";
import { isUuid } from "@/lib/uuid";

export type PublicListing = {
  id: string;
  title: string;
  description: string | null;
  kind: "digital_asset" | "service" | "physical_good";
  category: string | null;
  priceAmount: number;
  currencyCode: string;
  fulfillmentDays: number | null;
  imageUrl: string | null;
  sellerName: string | null;
  sellerLevel: number | null;
  ratingCount: number;
  ratingAverage: number | null;
  salesCount: number;
  createdAt: string;
  updatedAt: string;
  indexable: boolean;
};

const LISTING_FIELDS = "id,title,description,listing_kind,category,price_amount,currency_code,fulfillment_days,image_url,artifact_id,seller_user_id,rating_count,rating_sum,sales_count,status,metadata,created_at,updated_at";
const PUBLIC_LIST_LIMIT = 60;

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  listing_kind: string | null;
  category: string | null;
  price_amount: number | string;
  currency_code: string;
  fulfillment_days: number | null;
  image_url: string | null;
  artifact_id: string | null;
  seller_user_id: string;
  rating_count: number;
  rating_sum: number;
  sales_count: number;
  status: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export async function loadPublicListing(listingId: string): Promise<PublicListing | null> {
  if (!isUuid(listingId)) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db.from("marketplace_listings").select(LISTING_FIELDS).eq("id", listingId).eq("status", "active").maybeSingle();
  if (error || !data || isHiddenFromGuests(data.metadata)) return null;
  const [listing] = await withSellers(db, [data as ListingRow]);
  return listing ?? null;
}

export async function loadPublicListings(): Promise<PublicListing[]> {
  const db = serviceClient();
  if (!db) return [];
  const { data, error } = await db.from("marketplace_listings").select(LISTING_FIELDS).eq("status", "active")
    .order("created_at", { ascending: false }).limit(PUBLIC_LIST_LIMIT * 2);
  if (error || !data) return [];
  const visible = (data as ListingRow[]).filter((row) => !isHiddenFromGuests(row.metadata)).slice(0, PUBLIC_LIST_LIMIT);
  return withSellers(db, visible);
}

async function withSellers(db: any, rows: ListingRow[]): Promise<PublicListing[]> {
  if (!rows.length) return [];
  const sellerIds = Array.from(new Set(rows.map((row) => row.seller_user_id)));
  const artifactIds = Array.from(new Set(rows.map((row) => row.artifact_id).filter((id): id is string => Boolean(id))));
  const [profiles, humanity, artifacts] = await Promise.all([
    db.from("user_profiles").select("user_id,username,display_name,level,deleted_at").in("user_id", sellerIds),
    db.from("humanity_verifications").select("user_id,humanity_level").in("user_id", sellerIds),
    artifactIds.length ? db.from("user_artifacts").select("id,image_url").in("id", artifactIds) : Promise.resolve({ data: [] })
  ]);
  const profileById = new Map<string, any>((profiles.data ?? []).map((row: any) => [row.user_id, row]));
  const humanityById = new Map<string, number>((humanity.data ?? []).map((row: any) => [row.user_id, Number(row.humanity_level ?? 0)]));
  const artifactImage = new Map<string, string | null>((artifacts.data ?? []).map((row: any) => [row.id, row.image_url ?? null]));

  return rows.flatMap((row) => {
    const profile = profileById.get(row.seller_user_id);
    if (profile?.deleted_at) return [];
    const ratingCount = Number(row.rating_count ?? 0);
    return [{
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.listing_kind === "service" || row.listing_kind === "physical_good" ? row.listing_kind : "digital_asset",
      category: row.category,
      priceAmount: Number(row.price_amount),
      currencyCode: row.currency_code || "$",
      fulfillmentDays: row.fulfillment_days,
      imageUrl: safeImageUrl(row.image_url ?? (row.artifact_id ? artifactImage.get(row.artifact_id) ?? null : null)),
      sellerName: profile?.display_name ?? profile?.username ?? null,
      sellerLevel: profile?.level ?? null,
      ratingCount,
      ratingAverage: ratingCount > 0 ? Math.round((Number(row.rating_sum ?? 0) / ratingCount) * 10) / 10 : null,
      salesCount: Number(row.sales_count ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      indexable: isIndexableListing(row.description, humanityById.get(row.seller_user_id))
    }];
  });
}

/** Builds without server credentials (local or preview) render empty public pages instead of failing. */
function serviceClient(): any | null {
  try {
    return createServiceSupabaseClient();
  } catch {
    return null;
  }
}

function safeImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
