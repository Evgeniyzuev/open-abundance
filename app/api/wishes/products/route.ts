import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { loadLinkPreview, normalizeLinkSource } from "@/lib/sharePreview";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_ACTIVE_PRODUCTS = 200;

// The owner's "considering to buy" list.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const { data, error: listError } = await (supabase as any)
      .from("wish_products")
      .select("id,wish_id,source_url,title,description,image_url,price_amount,price_currency,status,created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_ACTIVE_PRODUCTS);
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ products: data ?? [] }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load products." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Add a product by its external link. Title, image and price come from the page's open metadata
// and can be overridden by the person; nothing else is read from the page.
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = (await request.json().catch(() => ({}))) as {
      url?: unknown; title?: unknown; priceAmount?: unknown; priceCurrency?: unknown;
    };
    const source = normalizeLinkSource(body.url);
    if (!source) return NextResponse.json({ error: "Enter a valid link." }, { status: 400, headers: NO_STORE_HEADERS });

    const { count } = await (supabase as any)
      .from("wish_products")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id);
    if ((count ?? 0) >= MAX_ACTIVE_PRODUCTS) {
      return NextResponse.json({ error: "The list is full." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const preview = await loadLinkPreview(source);
    const titleOverride = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
    const title = titleOverride || preview.title || source.fallbackTitle;

    const manualAmount = typeof body.priceAmount === "number" || typeof body.priceAmount === "string" ? Number(body.priceAmount) : NaN;
    const priceAmount = Number.isFinite(manualAmount) && manualAmount >= 0 && manualAmount < 1e12 ? Math.round(manualAmount * 100) / 100 : preview.priceAmount ?? null;
    const manualCurrency = typeof body.priceCurrency === "string" && /^[A-Za-z]{3}$/.test(body.priceCurrency.trim()) ? body.priceCurrency.trim().toUpperCase() : null;

    const { data, error: insertError } = await (supabase as any)
      .from("wish_products")
      .insert({
        owner_user_id: user.id,
        source_url: source.normalizedUrl,
        canonical_url: preview.canonicalUrl,
        title,
        description: preview.description ?? "",
        image_url: preview.thumbnailUrl,
        price_amount: priceAmount,
        price_currency: manualCurrency ?? preview.priceCurrency ?? "USD"
      })
      .select("id,wish_id,source_url,title,description,image_url,price_amount,price_currency,status,created_at")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.code === "23505" ? "This link is already in your list." : insertError.message },
        { status: insertError.code === "23505" ? 409 : 500, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ product: data }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to add the product." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
