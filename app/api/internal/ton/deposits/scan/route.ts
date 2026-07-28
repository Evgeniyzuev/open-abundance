import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Json } from "@/lib/database.types";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import type { TonPriceSnapshot } from "@/lib/tonDeposits";
import {
  extractTonTextComment,
  invoiceCodeFromComment,
  loadTonDepositConfig,
  normalizeTonAddress,
  normalizeTonCenterUrl,
  parsePositiveNanoTon,
  resolveTonPriceSnapshot
} from "@/lib/tonDeposits";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TonCenterPayload = {
  ok?: boolean;
  result?: TonCenterTransaction[];
  error?: string;
  code?: number;
};

type TonCenterTransaction = {
  account?: string;
  utime?: number;
  transaction_id?: {
    hash?: string;
    lt?: string;
  };
  description?: Record<string, unknown> | null;
  in_msg?: {
    source?: string | null;
    destination?: string | null;
    value?: string | number | null;
    message?: string | null;
    msg_data?: Record<string, unknown> | null;
    bounced?: boolean;
  } | null;
};

type ScanSummary = {
  scanned: number;
  inserted: number;
  settled: number;
  unmatched: number;
  awaitingRate: number;
  skipped: number;
};

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
  return scan(request);
}

export async function POST(request: NextRequest) {
  return scan(request);
}

async function scan(request: NextRequest) {
  const scannerSecret = process.env.TON_SCANNER_SECRET?.trim();
  const suppliedSecret = request.headers.get("x-ton-scanner-secret")?.trim();
  if (!scannerSecret) return jsonResponse({ error: "TON scanner is not configured." }, { status: 503 });
  if (!suppliedSecret || suppliedSecret !== scannerSecret) return jsonResponse({ error: "Unauthorized TON scanner request." }, { status: 401 });

  try {
    const supabase = createServiceSupabaseClient();
    const config = await loadTonDepositConfig(supabase);
    if (!config) return jsonResponse({ error: "TON deposit is not configured yet." }, { status: 503 });

    const { count: pendingInvoiceCount, error: queueError } = await supabase
      .from("ton_deposit_invoices")
      .select("id", { count: "exact", head: true })
      .eq("network", config.network)
      .eq("asset_code", "TON")
      .in("status", ["waiting", "detected", "finalizing", "awaiting_rate"]);
    if (queueError) throw new Error(queueError.message);
    if (!pendingInvoiceCount) {
      return jsonResponse({ network: config.network, skipped: true, reason: "no_pending_deposit_invoices" });
    }

    const rateSnapshot = await resolveTonPriceSnapshot(config.network);
    const summary: ScanSummary = {
      scanned: 0,
      inserted: 0,
      settled: 0,
      unmatched: 0,
      awaitingRate: 0,
      skipped: 0
    };
    await settleAwaitingRateEvents(supabase, config.network, rateSnapshot, summary);

    const transactions = await loadTransactions(config.toncenter_api_url, config.deposit_address);
    summary.scanned = transactions.length;
    let maxLogicalTime: string | null = null;

    for (const transaction of transactions) {
      const event = parseIncomingTonEvent(transaction, config.deposit_address, config.network);
      if (!event) {
        summary.skipped += 1;
        continue;
      }
      if (!maxLogicalTime || BigInt(event.logical_time) > BigInt(maxLogicalTime)) maxLogicalTime = event.logical_time;

      const { data: existingEvent, error: existingError } = await supabase
        .from("ton_chain_events")
        .select("id,status")
        .eq("network", event.network)
        .eq("transaction_hash", event.transaction_hash)
        .eq("logical_time", event.logical_time)
        .eq("message_index", event.message_index)
        .maybeSingle();

      if (existingError) throw new Error(existingError.message);
      if (existingEvent) {
        summary.skipped += 1;
        continue;
      }

      const { data: insertedEvent, error: insertError } = await supabase
        .from("ton_chain_events")
        .insert({
          ...event,
          ton_usd_rate: rateSnapshot?.rate ?? null,
          rate_provider: rateSnapshot?.provider ?? null,
          rate_source_timestamp: rateSnapshot?.sourceTimestamp ?? null,
          status: rateSnapshot ? "finalized" : "awaiting_rate"
        })
        .select("id,status,sender_address,invoice_code")
        .single();

      if (insertError || !insertedEvent) {
        if (insertError?.code === "23505") {
          summary.skipped += 1;
          continue;
        }
        throw new Error(insertError?.message ?? "Failed to store TON chain event.");
      }

      summary.inserted += 1;

      if (rateSnapshot) await saveRateSnapshot(supabase, config.network, rateSnapshot);

      if (insertedEvent.sender_address && insertedEvent.invoice_code) {
        await observeDepositAddress(supabase, insertedEvent.sender_address, insertedEvent.invoice_code, config.network);
      }

      if (!rateSnapshot) {
        if (insertedEvent.invoice_code) {
          await supabase
            .from("ton_deposit_invoices")
            .update({ status: "awaiting_rate" })
            .eq("network", config.network)
            .eq("asset_code", "TON")
            .eq("invoice_code", insertedEvent.invoice_code);
        }
        summary.awaitingRate += 1;
        continue;
      }

      await settleEvent(supabase, insertedEvent.id, summary);
    }

    if (maxLogicalTime) {
      const { error: cursorError } = await supabase
        .from("ton_chain_cursors")
        .upsert({
          network: config.network,
          deposit_address: config.deposit_address,
          last_logical_time: maxLogicalTime,
          updated_at: new Date().toISOString()
        }, { onConflict: "network,deposit_address" });
      if (cursorError) throw new Error(cursorError.message);
    }

    return jsonResponse({ network: config.network, depositAddress: config.deposit_address, summary });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to scan TON deposits." }, { status: 500 });
  }
}

async function settleAwaitingRateEvents(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  network: string,
  rateSnapshot: Awaited<ReturnType<typeof resolveTonPriceSnapshot>>,
  summary: ScanSummary
) {
  const { data: awaitingEvents, error } = await supabase
    .from("ton_chain_events")
    .select("id")
    .eq("network", network)
    .eq("asset_code", "TON")
    .eq("status", "awaiting_rate")
    .order("finalized_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);

  if (!rateSnapshot) {
    summary.awaitingRate += awaitingEvents?.length ?? 0;
    return;
  }

  for (const event of awaitingEvents ?? []) {
    const { data: claimedEvent, error: claimError } = await supabase
      .from("ton_chain_events")
      .update({
        status: "finalized",
        ton_usd_rate: rateSnapshot.rate,
        rate_provider: rateSnapshot.provider,
        rate_source_timestamp: rateSnapshot.sourceTimestamp
      })
      .eq("id", event.id)
      .eq("status", "awaiting_rate")
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimedEvent) {
      summary.skipped += 1;
      continue;
    }

    await saveRateSnapshot(supabase, network, rateSnapshot);
    await settleEvent(supabase, claimedEvent.id, summary);
  }
}

async function saveRateSnapshot(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  network: string,
  rateSnapshot: TonPriceSnapshot
) {
  const { error } = await supabase
    .from("ton_price_quotes")
    .insert({
      network,
      asset_code: "TON",
      usd_rate: rateSnapshot.rate,
      provider: rateSnapshot.provider,
      source_timestamp: rateSnapshot.sourceTimestamp
    });
  if (error) throw new Error(error.message);
}

async function settleEvent(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  eventId: string,
  summary: ScanSummary
) {
  const { data: settlementRows, error } = await supabase.rpc("settle_ton_deposit", {
    p_chain_event_id: eventId
  });
  if (error) throw new Error(error.message);

  const settlement = settlementRows?.[0];
  if (
    settlement?.event_status === "credited"
    || settlement?.event_status === "credited_late"
    || settlement?.event_status === "credited_amount_mismatch"
  ) {
    summary.settled += 1;
  } else if (settlement?.event_status === "unmatched") {
    summary.unmatched += 1;
  } else if (settlement?.event_status === "awaiting_rate") {
    summary.awaitingRate += 1;
  }
}

async function loadTransactions(apiUrl: string, address: string): Promise<TonCenterTransaction[]> {
  const url = new URL(`${normalizeTonCenterUrl(apiUrl)}/getTransactions`);
  url.searchParams.set("address", address);
  url.searchParams.set("limit", "100");

  const headers: HeadersInit = { Accept: "application/json" };
  const apiKey = process.env.TONCENTER_API_KEY?.trim();
  if (apiKey) headers["X-API-Key"] = apiKey;

  const response = await fetch(url, { cache: "no-store", headers });
  const payload = (await response.json().catch(() => ({}))) as TonCenterPayload;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? `TON Center request failed (${response.status}).`);
  }
  return Array.isArray(payload.result) ? payload.result : [];
}

function parseIncomingTonEvent(transaction: TonCenterTransaction, depositAddress: string, network: string) {
  const transactionHash = transaction.transaction_id?.hash?.trim();
  const logicalTime = transaction.transaction_id?.lt?.trim();
  const message = transaction.in_msg;
  const receiverAddress = normalizeTonAddress(message?.destination ?? depositAddress);
  const configuredAddress = normalizeTonAddress(depositAddress);
  const senderAddress = normalizeTonAddress(message?.source);
  const amountNano = parsePositiveNanoTon(message?.value);
  const description = transaction.description;
  const computePhase = description?.compute_phase as Record<string, unknown> | undefined;
  const exitCode = typeof computePhase?.exit_code === "number" ? computePhase.exit_code : null;
  const aborted = description && (description.aborted === true || (exitCode !== null && exitCode !== 0));
  if (!transactionHash || !logicalTime || !/^\d+$/.test(logicalTime) || !message || message.bounced === true || aborted || !receiverAddress || receiverAddress !== configuredAddress || !amountNano) return null;

  const comment = extractTonTextComment(message);
  return {
    network,
    asset_code: "TON",
    transaction_hash: transactionHash,
    logical_time: logicalTime,
    message_index: 0,
    sender_address: senderAddress,
    receiver_address: receiverAddress,
    amount_nano: amountNano,
    comment,
    invoice_code: invoiceCodeFromComment(comment),
    finalized_at: new Date((transaction.utime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    raw_transaction: transaction as unknown as Json
  };
}

async function observeDepositAddress(supabase: ReturnType<typeof createServiceSupabaseClient>, senderAddress: string, invoiceCode: string, network: string) {
  const { data: invoice } = await supabase
    .from("ton_deposit_invoices")
    .select("user_id")
    .eq("network", network)
    .eq("asset_code", "TON")
    .eq("invoice_code", invoiceCode)
    .maybeSingle();

  if (!invoice) return;

  await supabase
    .from("ton_user_wallets")
    .upsert({
      user_id: invoice.user_id,
      network,
      asset_code: "TON",
      normalized_address: senderAddress,
      verification_status: "observed"
    }, { onConflict: "network,asset_code,normalized_address", ignoreDuplicates: true });
}
