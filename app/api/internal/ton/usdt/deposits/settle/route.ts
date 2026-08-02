import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { loadTonUsdtConfig, resolveTonUsdtPriceResolution } from "@/lib/tonUsdt";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
function jsonResponse(body: unknown, init?: ResponseInit) { return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } }); }

export async function POST(request: NextRequest) {
  const scannerSecret = process.env.TON_SCANNER_SECRET?.trim();
  if (!scannerSecret) return jsonResponse({ error: "TON USDT settlement worker is not configured." }, { status: 503 });
  if (request.headers.get("x-ton-scanner-secret")?.trim() !== scannerSecret) return jsonResponse({ error: "Unauthorized TON USDT settlement request." }, { status: 401 });
  try {
    const supabase = createServiceSupabaseClient() as any;
    const config = await loadTonUsdtConfig(supabase);
    if (!config?.ready) return jsonResponse({ error: "TON USDT deposit is not configured yet.", reason: config?.reason ?? "disabled" }, { status: 503 });
    const { data: claimedRows, error: claimError } = await supabase.rpc("claim_ton_usdt_deposit_settlement_retries", { p_limit: 25 });
    if (claimError) throw new Error(claimError.message);
    const claimed = claimedRows ?? [];
    if (!claimed.length) return jsonResponse({ assetCode: "USDT", skipped: true, reason: "no_due_settlements" });
    const resolution = await resolveTonUsdtPriceResolution();
    if (!resolution.snapshot) {
      const errorCode = resolution.failureReason === "provider_deviation" ? "price_provider_deviation" : "price_unavailable";
      const errorMessage = resolution.failureReason === "provider_deviation" ? "USDT price providers differ beyond the configured threshold." : "USDT price providers are unavailable or stale.";
      for (const retry of claimed) {
        await supabase.from("ton_usdt_chain_events").update({ rate_metadata: resolution.diagnostics }).eq("id", retry.chain_event_id);
        await supabase.rpc("fail_ton_usdt_deposit_settlement_retry", { p_chain_event_id: retry.chain_event_id, p_error_code: errorCode, p_error_message: errorMessage });
      }
      return jsonResponse({ assetCode: "USDT", processed: claimed.length, settled: 0, retrying: claimed.length, reason: errorCode });
    }
    const price = resolution.snapshot;
    const { error: quoteError } = await supabase.from("ton_usdt_price_quotes").insert({ network: config.network, asset_code: "USDT", usd_rate: price.rate, provider: price.provider, source_timestamp: price.sourceTimestamp });
    if (quoteError) throw new Error(quoteError.message);
    let settled = 0;
    let retrying = 0;
    for (const retry of claimed) {
      try {
        const { data: finalizedEvent, error: eventError } = await supabase.from("ton_usdt_chain_events").update({ status: "finalized", usdt_usd_rate: price.rate, rate_provider: price.provider, rate_source_timestamp: price.sourceTimestamp, rate_metadata: price.metadata }).eq("id", retry.chain_event_id).in("status", ["awaiting_rate", "finalized"]).select("id").maybeSingle();
        if (eventError) throw new Error(eventError.message);
        const { data: settlementRows, error: settlementError } = await supabase.rpc("settle_ton_usdt_deposit", { p_chain_event_id: retry.chain_event_id });
        if (settlementError) throw new Error(settlementError.message);
        const status = settlementRows?.[0]?.event_status;
        if (finalizedEvent || ["credited", "credited_late", "credited_amount_mismatch", "unmatched"].includes(status ?? "")) {
          const { error: completeError } = await supabase.rpc("complete_ton_usdt_deposit_settlement_retry", { p_chain_event_id: retry.chain_event_id });
          if (completeError) throw new Error(completeError.message);
          settled += 1;
        }
      } catch (settlementError) {
        await supabase.rpc("fail_ton_usdt_deposit_settlement_retry", { p_chain_event_id: retry.chain_event_id, p_error_code: "settlement_failed", p_error_message: settlementError instanceof Error ? settlementError.message : "TON USDT settlement failed." });
        retrying += 1;
      }
    }
    return jsonResponse({ assetCode: "USDT", processed: claimed.length, settled, retrying });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to settle TON USDT deposits." }, { status: 500 });
  }
}