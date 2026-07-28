import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RedemptionBody = {
  network?: unknown;
  payoutAddress?: unknown;
  idempotencyKey?: unknown;
  confirmAddress?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = (await request.json().catch(() => ({}))) as RedemptionBody;
    const network = cleanText(body.network, 32);
    const payoutAddress = cleanText(body.payoutAddress, 256);
    const idempotencyKey = cleanText(body.idempotencyKey, 128) ?? randomUUID();
    if (!network || !payoutAddress || body.confirmAddress !== true) {
      return NextResponse.json({ error: "Network and payout address are required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error: rpcError } = await (supabase as any).rpc("redeem_core_after_breach", {
      p_user_id: user.id,
      p_network: network,
      p_payout_address: payoutAddress,
      p_idempotency_key: idempotencyKey
    });

    if (rpcError) {
      const status = rpcError.code === "42501" ? 403 : 409;
      return NextResponse.json({ error: rpcError.message }, { status, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ request: Array.isArray(data) ? data[0] ?? null : data }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Could not create the Core redemption request." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}
