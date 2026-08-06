import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, { params }: { params: { listingId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (!isUuid(params.listingId)) return NextResponse.json({ error: "Invalid listing id." }, { status: 400, headers: NO_STORE_HEADERS });
    const { data: listing, error: listingError } = await (supabase as any)
      .from("marketplace_listings")
      .select("*")
      .eq("id", params.listingId)
      .maybeSingle();
    if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!listing || (listing.status !== "active" && listing.seller_user_id !== user.id)) return NextResponse.json({ error: "Listing not found." }, { status: 404, headers: NO_STORE_HEADERS });
    const [{ data: artifact }, { data: sellerProfile }] = await Promise.all([
      listing.artifact_id ? (supabase as any).from("user_artifacts").select("id,artifact_type,image_url,rarity,title").eq("id", listing.artifact_id).maybeSingle() : Promise.resolve({ data: null }),
      (supabase as any).from("user_profiles").select("user_id,username,display_name,avatar_url,level").eq("user_id", listing.seller_user_id).maybeSingle()
    ]);
    return NextResponse.json({ listing: { ...listing, artifact, sellerProfile } }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to load listing." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { listingId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (!isUuid(params.listingId)) return NextResponse.json({ error: "Invalid listing id." }, { status: 400, headers: NO_STORE_HEADERS });
    const body = await request.json().catch(() => ({}));
    const { data: current, error: currentError } = await (supabase as any)
      .from("marketplace_listings")
      .select("*")
      .eq("id", params.listingId)
      .eq("seller_user_id", user.id)
      .maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!current) return NextResponse.json({ error: "Listing not found." }, { status: 404, headers: NO_STORE_HEADERS });
    if (current.status !== "active" && current.status !== "draft") return NextResponse.json({ error: "Only active or draft listings can be edited." }, { status: 400, headers: NO_STORE_HEADERS });

    const title = text(body.title, 120) ?? current.title;
    const description = typeof body.description === "undefined" ? current.description ?? null : text(body.description, 1000);
    const price = normalizeAmount(body.priceAmount) ?? Number(current.price_amount);
    const category = typeof body.category === "undefined" ? current.category ?? null : text(body.category, 80);
    const imageUrl = normalizeUrl(body.imageUrl) ?? current.image_url ?? null;
    const fulfillmentDays = current.listing_kind === "digital_asset" ? null : normalizeFulfillmentDays(body.fulfillmentDays) ?? current.fulfillment_days ?? 7;
    const terms = { ...(current.terms_json ?? {}), title, description, priceAmount: price, category, fulfillmentDays, version: Number(current.terms_version ?? 1) + 1 };
    const { data: listing, error: updateError } = await (supabase as any)
      .from("marketplace_listings")
      .update({ title, description, price_amount: price, category, image_url: imageUrl, fulfillment_days: fulfillmentDays, terms_version: Number(current.terms_version ?? 1) + 1, terms_json: terms, terms_hash: hashTerms(terms) })
      .eq("id", current.id)
      .eq("seller_user_id", user.id)
      .in("status", ["active", "draft"])
      .select("*")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ listing }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to update listing." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeAmount(value: unknown): number | null {
  const amount = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function normalizeUrl(value: unknown): string | null {
  const raw = text(value, 900);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function normalizeFulfillmentDays(value: unknown): number | null {
  const numeric = Number(value);
  return [1, 3, 7, 14].includes(numeric) ? numeric : null;
}

function hashTerms(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
