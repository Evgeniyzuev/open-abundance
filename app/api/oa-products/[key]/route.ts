import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { OA_PRODUCT_CONTENT } from "@/lib/oaProductContent";
import { PRODUCT_ACCESS_STATUSES, PRODUCT_KEY_FIELD, findOaProduct } from "@/lib/oaProducts";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/oa-products/<key>
 *
 * The text of an Open Abundance product, only for a person who bought it on the Market: a deal of theirs as buyer,
 * on a listing of this product, that is accepted, delivered or completed. Everyone else gets 404.
 */
export async function GET(request: NextRequest, { params }: { params: { key: string } }) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const product = findOaProduct(params.key);
  const markdown = product ? OA_PRODUCT_CONTENT[product.key] : null;
  if (!product || !markdown) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });

  const db = createServiceSupabaseClient() as any;
  const { data: listings, error: listingsError } = await db
    .from("marketplace_listings")
    .select("id")
    .eq(`metadata->>${PRODUCT_KEY_FIELD}`, product.key)
    .limit(50);
  if (listingsError) return NextResponse.json({ error: "Could not check your purchase." }, { status: 500, headers: NO_STORE_HEADERS });
  const listingIds = ((listings ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (!listingIds.length) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });

  const { count, error: dealError } = await db
    .from("marketplace_deals")
    .select("id", { count: "exact", head: true })
    .eq("buyer_user_id", user.id)
    .in("listing_id", listingIds)
    .in("status", [...PRODUCT_ACCESS_STATUSES]);
  if (dealError) return NextResponse.json({ error: "Could not check your purchase." }, { status: 500, headers: NO_STORE_HEADERS });
  if (!Number(count ?? 0)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });

  return NextResponse.json({ key: product.key, title: product.title, markdown }, { headers: NO_STORE_HEADERS });
}
