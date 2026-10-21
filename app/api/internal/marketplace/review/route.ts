import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { guestReview, withOperatorReview } from "@/lib/marketplaceGuestVisibility";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Operator queue for listings the automatic check held back from guests (lib/marketplaceListingCheck.ts).
 * GET lists them; PATCH { id, status: "approved" | "rejected" } decides. Non-operators get 404.
 */
export async function GET(request: NextRequest) {
  const denied = await denyNonOperator(request);
  if (denied) return denied;
  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db
    .from("marketplace_listings")
    .select("id,title,description,category,listing_kind,price_amount,currency_code,seller_user_id,metadata,created_at")
    .eq("status", "active")
    .eq("metadata->guest_review->>status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    kind: row.listing_kind,
    price: `${row.price_amount} ${row.currency_code}`,
    sellerUserId: row.seller_user_id,
    flags: guestReview(row.metadata)?.flags ?? [],
    createdAt: row.created_at
  }));
  return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const denied = await denyNonOperator(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
  if (!isUuid(body.id) || !status) return NextResponse.json({ error: "Expected id and status." }, { status: 400, headers: NO_STORE_HEADERS });
  const db = createServiceSupabaseClient() as any;
  const { data: current, error: currentError } = await db.from("marketplace_listings").select("id,metadata").eq("id", body.id).maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (!current) return NextResponse.json({ error: "Listing not found." }, { status: 404, headers: NO_STORE_HEADERS });
  const { error } = await db.from("marketplace_listings").update({ metadata: withOperatorReview(current.metadata, status, new Date().toISOString()) }).eq("id", current.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  revalidatePath(`/m/${current.id}`);
  revalidatePath("/m");
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

async function denyNonOperator(request: NextRequest): Promise<NextResponse | null> {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user || !isGrowthOperator(auth.user.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }
  return null;
}
