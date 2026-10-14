import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { findSacredItem } from "@/lib/sacredItems";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const CLIENT_ERRORS = new Set([
  "Insufficient wallet balance.",
  "Wallet is not created yet."
]);

// Buy one collectible item from the system for $. Title, rarity and price always come from the catalog.
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = (await request.json().catch(() => ({}))) as { itemKey?: unknown; idempotencyKey?: unknown };
    const item = findSacredItem(body.itemKey);
    if (!item || item.price === undefined) return NextResponse.json({ error: "Unknown shop item." }, { status: 404, headers: NO_STORE_HEADERS });

    const clientKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";
    if (!clientKey) return NextResponse.json({ error: "Idempotency key is required." }, { status: 400, headers: NO_STORE_HEADERS });

    const { data, error: rpcError } = await (supabase as any).rpc("buy_system_item", {
      p_user_id: user.id,
      p_item_key: item.key,
      p_title: item.title.ru,
      p_description: item.description.ru,
      p_rarity: item.rarity,
      p_price: item.price,
      p_metadata: { group: item.group, glyph: item.glyph, title_en: item.title.en, description_en: item.description.en },
      p_idempotency_key: `shop:${user.id}:${clientKey}`
    });

    if (rpcError) {
      const message = rpcError.message || "Failed to buy the item.";
      return NextResponse.json({ error: message }, { status: CLIENT_ERRORS.has(message) ? 400 : 500, headers: NO_STORE_HEADERS });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      { artifactId: row?.artifact_id ?? null, balanceAfter: row?.balance_after ?? null },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to buy the item." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
