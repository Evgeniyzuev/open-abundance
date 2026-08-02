import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  loadTonDepositConfig,
  resolveTonNetwork,
  resolveTonPriceSnapshot,
  resolveUsdtPriceSnapshot
} from "@/lib/tonDeposits";
import { loadTonUsdtConfig } from "@/lib/tonUsdt";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const network = resolveTonNetwork();
    const [config, usdtConfig, tonQuote, usdtQuote] = await Promise.all([
      loadTonDepositConfig(supabase).catch(() => null),
      loadTonUsdtConfig(supabase as any).catch(() => null),
      resolveTonPriceSnapshot(network),
      resolveUsdtPriceSnapshot()
    ]);

    return jsonResponse({
      quotes: [
        {
          assetCode: "TON",
          network,
          usdRate: tonQuote?.rate ?? null,
          provider: tonQuote?.provider ?? null,
          sourceTimestamp: tonQuote?.sourceTimestamp ?? null,
          depositEnabled: Boolean(config)
        },
        {
          assetCode: "USDT",
          network: usdtConfig?.network ?? "mainnet",
          usdRate: usdtQuote?.rate ?? null,
          provider: usdtQuote?.provider ?? null,
          sourceTimestamp: usdtQuote?.sourceTimestamp ?? null,
          depositEnabled: Boolean(usdtConfig?.ready)
        }
      ]
    });
  } catch (routeError) {
    return jsonResponse({
      error: routeError instanceof Error ? routeError.message : "Failed to load deposit quotes."
    }, { status: 500 });
  }
}
