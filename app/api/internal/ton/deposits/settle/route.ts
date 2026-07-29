import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { loadTonDepositConfig, resolveTonPriceSnapshot } from "@/lib/tonDeposits";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers }
  });
}

export async function POST(request: NextRequest) {
  const scannerSecret = process.env.TON_SCANNER_SECRET?.trim();
  const suppliedSecret = request.headers.get("x-ton-scanner-secret")?.trim();
  if (!scannerSecret) return jsonResponse({ error: "TON settlement worker is not configured." }, { status: 503 });
  if (!suppliedSecret || suppliedSecret !== scannerSecret) {
    return jsonResponse({ error: "Unauthorized TON settlement request." }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const config = await loadTonDepositConfig(supabase);
    if (!config) return jsonResponse({ error: "TON deposit is not configured yet." }, { status: 503 });

    const { data: claimedRows, error: claimError } = await supabase.rpc("claim_ton_deposit_settlement_retries", {
      p_limit: 25
    });
    if (claimError) throw new Error(claimError.message);
    const claimed = claimedRows ?? [];
    if (!claimed.length) return jsonResponse({ skipped: true, reason: "no_due_settlements" });

    const price = await resolveTonPriceSnapshot(config.network);
    if (!price) {
      for (const retry of claimed) {
        await supabase.rpc("fail_ton_deposit_settlement_retry", {
          p_chain_event_id: retry.chain_event_id,
          p_error_code: "price_unavailable",
          p_error_message: "DIA TON/USD quote is unavailable or stale."
        });
      }
      return jsonResponse({ processed: claimed.length, settled: 0, retrying: claimed.length });
    }

    const { error: quoteError } = await supabase.from("ton_price_quotes").insert({
      network: config.network,
      asset_code: "TON",
      usd_rate: price.rate,
      provider: price.provider,
      source_timestamp: price.sourceTimestamp
    });
    if (quoteError) throw new Error(quoteError.message);

    let settled = 0;
    let retrying = 0;
    for (const retry of claimed) {
      try {
        const { data: finalizedEvent, error: eventError } = await supabase
          .from("ton_chain_events")
          .update({
            status: "finalized",
            ton_usd_rate: price.rate,
            rate_provider: price.provider,
            rate_source_timestamp: price.sourceTimestamp
          })
          .eq("id", retry.chain_event_id)
          .in("status", ["awaiting_rate", "finalized"])
          .select("id")
          .maybeSingle();
        if (eventError) throw new Error(eventError.message);

        const { data: settlementRows, error: settlementError } = await supabase.rpc("settle_ton_deposit", {
          p_chain_event_id: retry.chain_event_id
        });
        if (settlementError) throw new Error(settlementError.message);
        const status = settlementRows?.[0]?.event_status;

        if (finalizedEvent || ["credited", "credited_late", "credited_amount_mismatch", "unmatched"].includes(status ?? "")) {
          const { error: completeError } = await supabase.rpc("complete_ton_deposit_settlement_retry", {
            p_chain_event_id: retry.chain_event_id
          });
          if (completeError) throw new Error(completeError.message);
          settled += 1;
        }
      } catch (settlementError) {
        await supabase.rpc("fail_ton_deposit_settlement_retry", {
          p_chain_event_id: retry.chain_event_id,
          p_error_code: "settlement_failed",
          p_error_message: settlementError instanceof Error ? settlementError.message : "TON settlement failed."
        });
        retrying += 1;
      }
    }

    return jsonResponse({ processed: claimed.length, settled, retrying });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to settle TON deposits." }, { status: 500 });
  }
}
