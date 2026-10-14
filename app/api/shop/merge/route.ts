import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { nextSacredRarity, SACRED_ITEMS } from "@/lib/sacredItems";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const CLIENT_ERRORS = new Set([
  "A contract needs two different items.",
  "Items are not available for a contract.",
  "Items must share a rarity that can be upgraded.",
  "Items are listed in Market."
]);

// The owner's sacred items that are free to be used in a contract.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const [{ data: artifacts, error: artifactsError }, { data: listed }] = await Promise.all([
      supabase
        .from("user_artifacts")
        .select("id,title,description,rarity,metadata,created_at")
        .eq("user_id", user.id)
        .eq("artifact_type", "sacred_item")
        .eq("transferable", true)
        .is("locked_by_deal_id", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("marketplace_listings")
        .select("artifact_id")
        .eq("seller_user_id", user.id)
        .in("status", ["draft", "active", "reserved"])
    ]);
    if (artifactsError) return NextResponse.json({ error: artifactsError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const listedIds = new Set((listed ?? []).map((row) => row.artifact_id));
    return NextResponse.json(
      { items: (artifacts ?? []).filter((artifact) => !listedIds.has(artifact.id)) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load items." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Contract: two sacred items of one rarity become one random catalog item of the next rarity.
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = (await request.json().catch(() => ({}))) as { artifactIds?: unknown; idempotencyKey?: unknown };
    const ids = Array.isArray(body.artifactIds) ? body.artifactIds : [];
    if (ids.length !== 2 || !ids.every((id): id is string => typeof id === "string" && isUuid(id)) || ids[0] === ids[1]) {
      return NextResponse.json({ error: "A contract needs two different items." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const clientKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";
    if (!clientKey) return NextResponse.json({ error: "Idempotency key is required." }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: inputs, error: inputsError } = await supabase
      .from("user_artifacts")
      .select("rarity")
      .eq("user_id", user.id)
      .in("id", ids);
    if (inputsError) return NextResponse.json({ error: inputsError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!inputs || inputs.length !== 2 || inputs[0].rarity !== inputs[1].rarity) {
      return NextResponse.json({ error: "Items must share a rarity that can be upgraded." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const nextRarity = nextSacredRarity(inputs[0].rarity);
    const pool = SACRED_ITEMS.filter((item) => item.rarity === nextRarity);
    if (!nextRarity || pool.length === 0) {
      return NextResponse.json({ error: "Items must share a rarity that can be upgraded." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const result = pool[randomInt(pool.length)];

    const { data: artifactId, error: rpcError } = await (supabase as any).rpc("merge_system_items", {
      p_user_id: user.id,
      p_artifact_ids: ids,
      p_item_key: result.key,
      p_title: result.title.ru,
      p_description: result.description.ru,
      p_rarity: result.rarity,
      p_metadata: { group: result.group, glyph: result.glyph, title_en: result.title.en, description_en: result.description.en },
      p_idempotency_key: `merge:${user.id}:${clientKey}`
    });

    if (rpcError) {
      const message = rpcError.message || "Failed to complete the contract.";
      return NextResponse.json({ error: message }, { status: CLIENT_ERRORS.has(message) ? 400 : 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ artifactId, itemKey: result.key, rarity: result.rarity }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to complete the contract." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
