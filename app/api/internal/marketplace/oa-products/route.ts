import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildTerms, hashTerms } from "@/lib/marketplaceTerms";
import { PRODUCT_KEY_FIELD, findOaProduct } from "@/lib/oaProducts";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * POST /api/internal/marketplace/oa-products  { productKey, price }
 *
 * Creates the Market listing of one Open Abundance product for the OA account (env OA_SELLER_USER_ID). The price is
 * given here, product by product, at launch. One active listing per product. Protected by the marketplace secret.
 * GET lists the OA listings that already exist.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE_HEADERS });
  const sellerId = process.env.OA_SELLER_USER_ID?.trim();
  if (!sellerId || !isUuid(sellerId)) return NextResponse.json({ error: "OA_SELLER_USER_ID is not configured." }, { status: 500, headers: NO_STORE_HEADERS });

  const body = await request.json().catch(() => ({}));
  const product = findOaProduct(body.productKey);
  const price = Math.round(Number(body.price) * 100) / 100;
  if (!product) return NextResponse.json({ error: "Unknown product." }, { status: 400, headers: NO_STORE_HEADERS });
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Price must be greater than 0." }, { status: 400, headers: NO_STORE_HEADERS });

  const db = createServiceSupabaseClient() as any;
  const { data: existing, error: existingError } = await db
    .from("marketplace_listings")
    .select("id")
    .eq("seller_user_id", sellerId)
    .eq(`metadata->>${PRODUCT_KEY_FIELD}`, product.key)
    .in("status", ["draft", "active", "reserved"])
    .limit(1);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (existing?.length) return NextResponse.json({ error: "This product already has an open listing.", listingId: existing[0].id }, { status: 409, headers: NO_STORE_HEADERS });

  const terms = buildTerms({ artifact: null, description: product.description, priceAmount: price, title: product.title, listingKind: "service", fulfillmentDays: product.fulfillmentDays, category: product.category });
  const { data: listing, error } = await db
    .from("marketplace_listings")
    .insert({
      artifact_id: null,
      currency_code: "$",
      description: product.description,
      image_url: null,
      listing_kind: "service",
      category: product.category,
      fulfillment_days: product.fulfillmentDays,
      price_amount: price,
      seller_user_id: sellerId,
      status: "active",
      terms_hash: hashTerms(terms),
      terms_json: terms,
      terms_version: 1,
      title: product.title,
      metadata: { [PRODUCT_KEY_FIELD]: product.key }
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  revalidatePath("/m");
  return NextResponse.json({ listingId: listing.id }, { status: 201, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE_HEADERS });
  const sellerId = process.env.OA_SELLER_USER_ID?.trim();
  if (!sellerId || !isUuid(sellerId)) return NextResponse.json({ error: "OA_SELLER_USER_ID is not configured." }, { status: 500, headers: NO_STORE_HEADERS });
  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db.from("marketplace_listings").select("id,title,price_amount,status,metadata,sales_count").eq("seller_user_id", sellerId).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ items: data ?? [] }, { headers: NO_STORE_HEADERS });
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.MARKETPLACE_INTERNAL_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers.get("x-marketplace-internal-secret") || request.headers.get("x-cron-secret");
  return Boolean(expected && supplied && expected === supplied);
}
