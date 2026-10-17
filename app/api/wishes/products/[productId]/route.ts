import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const STATUSES = new Set(["considering", "bought", "dropped"]);

// Change an own product: its status (considering, bought, dropped), price, title or picture link.
export async function PATCH(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const productId = normalizeUuid(params.productId);
    const body = (await request.json().catch(() => ({}))) as { status?: unknown; priceAmount?: unknown; priceCurrency?: unknown; title?: unknown; imageUrl?: unknown };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.status === "string") {
      if (!STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });
      patch.status = body.status;
    }
    if (body.priceAmount !== undefined) {
      const amount = body.priceAmount === null ? null : Number(body.priceAmount);
      if (amount !== null && !(Number.isFinite(amount) && amount >= 0 && amount < 1e12)) {
        return NextResponse.json({ error: "Invalid price." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      patch.price_amount = amount === null ? null : Math.round(amount * 100) / 100;
      if (typeof body.priceCurrency === "string" && /^[A-Za-z]{3}$/.test(body.priceCurrency.trim())) patch.price_currency = body.priceCurrency.trim().toUpperCase();
    }
    if (typeof body.title === "string") {
      const title = body.title.trim().slice(0, 240);
      if (!title) return NextResponse.json({ error: "Enter a title." }, { status: 400, headers: NO_STORE_HEADERS });
      patch.title = title;
    }
    if (body.imageUrl !== undefined) {
      // The picture is only shown in the owner's own list (never fetched by the server), so any http(s) address will do.
      const image = body.imageUrl === null || body.imageUrl === "" ? null : typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined;
      if (image === undefined || (image !== null && !/^https?:\/\/[^\s]{1,1900}$/i.test(image))) return NextResponse.json({ error: "Enter a valid image link." }, { status: 400, headers: NO_STORE_HEADERS });
      patch.image_url = image;
    }
    if (!productId || Object.keys(patch).length < 2) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { data, error: updateError } = await (supabase as any)
      .from("wish_products")
      .update(patch)
      .eq("id", productId)
      .eq("owner_user_id", user.id)
      .select("id,status,price_amount,price_currency,title,image_url")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!data) return NextResponse.json({ error: "Product not found." }, { status: 404, headers: NO_STORE_HEADERS });
    return NextResponse.json({ product: data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update the product." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const productId = normalizeUuid(params.productId);
    if (!productId) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });
    const { error: deleteError } = await (supabase as any)
      .from("wish_products")
      .delete()
      .eq("id", productId)
      .eq("owner_user_id", user.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to delete the product." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
