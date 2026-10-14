import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const STATUSES = new Set(["considering", "bought", "dropped"]);

// Change the status of an own product: still considering, bought or dropped.
export async function PATCH(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const productId = normalizeUuid(params.productId);
    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    if (!productId || typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { data, error: updateError } = await (supabase as any)
      .from("wish_products")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", productId)
      .eq("owner_user_id", user.id)
      .select("id,status")
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
