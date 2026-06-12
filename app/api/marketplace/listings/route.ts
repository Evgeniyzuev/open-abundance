import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type ListingPostBody = {
  artifactId?: unknown;
  description?: unknown;
  priceAmount?: unknown;
  title?: unknown;
};

type MarketplaceListingRow = Tables<"marketplace_listings">;
type UserArtifactRow = Tables<"user_artifacts">;
type UserProfileRow = Pick<Tables<"user_profiles">, "avatar_url" | "display_name" | "user_id" | "username">;

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const [listingsResult, sellableResult] = await Promise.all([
      supabase
        .from("marketplace_listings")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("user_artifacts")
        .select("*")
        .eq("user_id", user.id)
        .eq("transferable", true)
        .is("locked_by_deal_id", null)
        .order("created_at", { ascending: false })
    ]);

    if (listingsResult.error) {
      return NextResponse.json({ error: listingsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (sellableResult.error) {
      return NextResponse.json({ error: sellableResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const listings = listingsResult.data ?? [];
    const artifacts = await loadArtifacts(supabase, listings.map((listing) => listing.artifact_id));
    const profiles = await loadProfiles(supabase, listings.map((listing) => listing.seller_user_id));
    const openArtifactIds = new Set(listings.filter((listing) => listing.seller_user_id === user.id).map((listing) => listing.artifact_id));

    return NextResponse.json(
      {
        listings: listings.map((listing) => serializeListing(listing, artifacts.get(listing.artifact_id) ?? null, profiles.get(listing.seller_user_id) ?? null)),
        sellableArtifacts: (sellableResult.data ?? []).filter((artifact) => !openArtifactIds.has(artifact.id))
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load marketplace listings." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const artifactId = normalizeUuid(body.artifactId);
    const priceAmount = normalizeAmount(body.priceAmount);

    if (!artifactId) {
      return NextResponse.json({ error: "Select an item to sell." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (!priceAmount) {
      return NextResponse.json({ error: "Enter a price greater than 0." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: artifact, error: artifactError } = await supabase
      .from("user_artifacts")
      .select("*")
      .eq("id", artifactId)
      .eq("user_id", user.id)
      .eq("transferable", true)
      .is("locked_by_deal_id", null)
      .maybeSingle();

    if (artifactError) {
      return NextResponse.json({ error: artifactError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (!artifact) {
      return NextResponse.json({ error: "This item cannot be listed." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const { data: existingListing, error: existingError } = await supabase
      .from("marketplace_listings")
      .select("id,status")
      .eq("artifact_id", artifact.id)
      .in("status", ["draft", "active", "reserved"])
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (existingListing) {
      return NextResponse.json({ error: "This item already has an open listing." }, { status: 409, headers: NO_STORE_HEADERS });
    }

    const title = normalizeText(body.title, 120) ?? artifact.title;
    const description = normalizeText(body.description, 1000) ?? artifact.description;
    const terms = buildTerms({ artifact, description, priceAmount, title });

    const row: TablesInsert<"marketplace_listings"> = {
      artifact_id: artifact.id,
      currency_code: "OA$",
      description,
      price_amount: priceAmount,
      seller_user_id: user.id,
      status: "active",
      terms_hash: hashTerms(terms),
      terms_json: terms,
      title
    };

    const { data: listing, error: insertError } = await supabase
      .from("marketplace_listings")
      .insert(row)
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: insertError.code === "23505" ? 409 : 500, headers: NO_STORE_HEADERS });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("user_id,username,display_name,avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json(
      { listing: serializeListing(listing, artifact, profile ?? null) },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create marketplace listing." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function serializeListing(listing: MarketplaceListingRow, artifact: UserArtifactRow | null, sellerProfile: UserProfileRow | null) {
  return {
    ...listing,
    artifact: artifact
      ? {
          artifact_type: artifact.artifact_type,
          id: artifact.id,
          image_url: artifact.image_url,
          rarity: artifact.rarity,
          title: artifact.title
        }
      : null,
    sellerProfile
  };
}

async function loadArtifacts(supabase: SupabaseClient<Database>, artifactIds: string[]) {
  const uniqueIds = Array.from(new Set(artifactIds));
  if (!uniqueIds.length) return new Map<string, UserArtifactRow>();

  const { data, error } = await supabase
    .from("user_artifacts")
    .select("*")
    .in("id", uniqueIds);

  if (error) throw error;
  return new Map((data ?? []).map((artifact) => [artifact.id, artifact]));
}

async function loadProfiles(supabase: SupabaseClient<Database>, userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds));
  if (!uniqueIds.length) return new Map<string, UserProfileRow>();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url")
    .in("user_id", uniqueIds);

  if (error) throw error;
  return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
}

async function readJsonBody(request: NextRequest): Promise<ListingPostBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

function buildTerms({ artifact, description, priceAmount, title }: { artifact: UserArtifactRow; description: string | null; priceAmount: number; title: string }) {
  return {
    artifactId: artifact.id,
    artifactTitle: artifact.title,
    currencyCode: "OA$",
    description,
    priceAmount,
    title,
    version: 1
  };
}

function hashTerms(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value) ? value : null;
}
