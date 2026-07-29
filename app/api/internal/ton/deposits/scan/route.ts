import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Json } from "@/lib/database.types";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import {
  extractTonTextComment,
  invoiceCodeFromComment,
  loadTonDepositConfig,
  normalizeTonAddress,
  normalizeTonCenterUrl,
  parsePositiveNanoTon
} from "@/lib/tonDeposits";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TonCenterPayload = {
  ok?: boolean;
  result?: TonCenterTransaction[];
  previous_transaction?: { lt?: string; hash?: string };
  error?: string;
  description?: string;
};

type TonCenterTransaction = {
  utime?: number;
  transaction_id?: { hash?: string; lt?: string };
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

type ParsedTonEvent = {
  event: {
    network: string;
    asset_code: "TON";
    transaction_hash: string;
    logical_time: string;
    message_index: number;
    sender_address: string | null;
    receiver_address: string;
    amount_nano: string;
    comment: string | null;
    invoice_code: string | null;
    finalized_at: string;
    raw_transaction: Json;
  };
  rejectionReason: "bounced" | "aborted" | null;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers }
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
  if (!suppliedSecret || suppliedSecret !== scannerSecret) {
    return jsonResponse({ error: "Unauthorized TON scanner request." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  let leaseId: string | null = null;

  try {
    const config = await loadTonDepositConfig(supabase);
    if (!config) return jsonResponse({ error: "TON deposit is not configured yet." }, { status: 503 });

    const { data: claimedLease, error: leaseError } = await supabase.rpc("claim_ton_chain_scan", {
      p_network: config.network,
      p_deposit_address: config.deposit_address
    });
    if (leaseError) throw new Error(leaseError.message);
    leaseId = claimedLease;
    if (!leaseId) return jsonResponse({ network: config.network, skipped: true, reason: "scan_already_running" });

    const { data: cursor, error: cursorError } = await supabase
      .from("ton_chain_cursors")
      .select("last_logical_time,last_transaction_hash")
      .eq("network", config.network)
      .eq("deposit_address", config.deposit_address)
      .maybeSingle();
    if (cursorError) throw new Error(cursorError.message);

    const transactionPage = await loadTransactions(
      config.toncenter_api_url,
      config.deposit_address,
      cursor?.last_logical_time ?? null
    );

    if (!cursor) {
      if (transactionPage.latestLogicalTime) {
        await saveCursor(
          supabase,
          config.network,
          config.deposit_address,
          transactionPage.latestLogicalTime,
          transactionPage.latestTransactionHash
        );
      }
      return jsonResponse({
        network: config.network,
        skipped: true,
        reason: "cursor_initialized",
        cursor: transactionPage.latestLogicalTime
      });
    }

    const newTransactions = transactionPage.transactions
      .filter((transaction) => {
        const logicalTime = transaction.transaction_id?.lt?.trim();
        return Boolean(logicalTime && /^\d+$/.test(logicalTime) && BigInt(logicalTime) > BigInt(cursor.last_logical_time));
      })
      .sort(compareTonTransactionsAscending);

    if (!newTransactions.length) {
      return jsonResponse({ network: config.network, scanned: 0, inserted: 0, skipped: true, reason: "no_new_transactions" });
    }

    let inserted = 0;
    let ignored = 0;
    for (const transaction of newTransactions) {
      const parsed = parseIncomingTonEvent(transaction, config.deposit_address, config.network);
      if (!parsed) {
        ignored += 1;
        continue;
      }

      const { data: chainEvent, error: insertError } = await supabase
        .from("ton_chain_events")
        .insert({
          ...parsed.event,
          rejection_reason: parsed.rejectionReason,
          status: parsed.rejectionReason ? "failed" : "awaiting_rate"
        })
        .select("id,sender_address,invoice_code")
        .single();

      if (insertError?.code === "23505") {
        const { data: existingEvent, error: existingError } = await supabase
          .from("ton_chain_events")
          .select("id,status,sender_address,invoice_code")
          .eq("network", parsed.event.network)
          .eq("transaction_hash", parsed.event.transaction_hash)
          .eq("logical_time", parsed.event.logical_time)
          .eq("message_index", parsed.event.message_index)
          .single();
        if (existingError || !existingEvent) {
          throw new Error(existingError?.message ?? "Failed to reload an existing TON chain event.");
        }
        if (["awaiting_rate", "finalized"].includes(existingEvent.status)) {
          const { error: retryError } = await supabase.rpc("enqueue_ton_deposit_settlement_retry", {
            p_chain_event_id: existingEvent.id
          });
          if (retryError) throw new Error(retryError.message);
        }
        ignored += 1;
        continue;
      }
      if (insertError || !chainEvent) throw new Error(insertError?.message ?? "Failed to store TON chain event.");
      inserted += 1;

      if (parsed.rejectionReason) {
        const { error: rejectError } = await supabase.rpc("mark_ton_deposit_rejected", {
          p_chain_event_id: chainEvent.id,
          p_reason: parsed.rejectionReason
        });
        if (rejectError) throw new Error(rejectError.message);
        continue;
      }

      const { error: retryError } = await supabase.rpc("enqueue_ton_deposit_settlement_retry", {
        p_chain_event_id: chainEvent.id
      });
      if (retryError) throw new Error(retryError.message);

      if (chainEvent.sender_address && chainEvent.invoice_code) {
        await observeDepositAddress(supabase, chainEvent.sender_address, chainEvent.invoice_code, config.network);
      }
    }

    if (transactionPage.latestLogicalTime) {
      await saveCursor(
        supabase,
        config.network,
        config.deposit_address,
        transactionPage.latestLogicalTime,
        transactionPage.latestTransactionHash
      );
    }

    return jsonResponse({
      network: config.network,
      scanned: newTransactions.length,
      inserted,
      ignored,
      cursor: transactionPage.latestLogicalTime
    });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to scan TON deposits." }, { status: 500 });
  } finally {
    if (leaseId) {
      await supabase.rpc("release_ton_chain_scan", { p_run_id: leaseId });
    }
  }
}

async function saveCursor(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  network: string,
  depositAddress: string,
  logicalTime: string,
  transactionHash: string | null
) {
  const { error } = await supabase.from("ton_chain_cursors").upsert({
    network,
    deposit_address: depositAddress,
    last_logical_time: logicalTime,
    last_transaction_hash: transactionHash,
    updated_at: new Date().toISOString()
  }, { onConflict: "network,deposit_address" });
  if (error) throw new Error(error.message);
}

async function loadTransactions(
  apiUrl: string,
  address: string,
  cursorLogicalTime: string | null
): Promise<{
  transactions: TonCenterTransaction[];
  latestLogicalTime: string | null;
  latestTransactionHash: string | null;
}> {
  const headers: HeadersInit = { Accept: "application/json" };
  const apiKey = process.env.TONCENTER_API_KEY?.trim();
  if (apiKey) headers["X-API-Key"] = apiKey;

  const transactions = new Map<string, TonCenterTransaction>();
  let nextLogicalTime: string | null = null;
  let nextHash: string | null = null;
  let latestLogicalTime: string | null = null;
  let latestTransactionHash: string | null = null;
  let reachedCursor = cursorLogicalTime === null;

  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    const url = new URL(`${normalizeTonCenterUrl(apiUrl)}/getTransactions`);
    url.searchParams.set("address", address);
    url.searchParams.set("limit", "100");
    if (cursorLogicalTime) url.searchParams.set("to_lt", cursorLogicalTime);
    if (nextLogicalTime && nextHash) {
      url.searchParams.set("lt", nextLogicalTime);
      url.searchParams.set("hash", nextHash);
    }

    const response = await fetch(url, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(10_000)
    });
    const payload = (await response.json().catch(() => ({}))) as TonCenterPayload;
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? payload.description ?? `TON Center request failed (${response.status}).`);
    }

    const pageTransactions = Array.isArray(payload.result) ? payload.result : [];
    for (const transaction of pageTransactions) {
      const logicalTime = transaction.transaction_id?.lt?.trim();
      const transactionHash = transaction.transaction_id?.hash?.trim();
      if (!logicalTime || !transactionHash || !/^\d+$/.test(logicalTime)) continue;
      transactions.set(`${logicalTime}:${transactionHash}`, transaction);
      if (!latestLogicalTime || BigInt(logicalTime) > BigInt(latestLogicalTime)) {
        latestLogicalTime = logicalTime;
        latestTransactionHash = transactionHash;
      }
      if (cursorLogicalTime && BigInt(logicalTime) <= BigInt(cursorLogicalTime)) reachedCursor = true;
    }

    if (!pageTransactions.length || reachedCursor) break;
    nextLogicalTime = payload.previous_transaction?.lt?.trim() ?? null;
    nextHash = payload.previous_transaction?.hash?.trim() ?? null;
    if (!nextLogicalTime || !nextHash || !/^\d+$/.test(nextLogicalTime)) break;
    if (cursorLogicalTime && BigInt(nextLogicalTime) <= BigInt(cursorLogicalTime)) break;
  }

  if (cursorLogicalTime && !reachedCursor && transactions.size >= 2_000) {
    throw new Error("TON transaction pagination limit was reached before the saved cursor.");
  }

  return { transactions: [...transactions.values()], latestLogicalTime, latestTransactionHash };
}

function parseIncomingTonEvent(
  transaction: TonCenterTransaction,
  depositAddress: string,
  network: string
): ParsedTonEvent | null {
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
  if (!transactionHash || !logicalTime || !/^\d+$/.test(logicalTime) || !message || !receiverAddress || receiverAddress !== configuredAddress || !amountNano) return null;

  const comment = extractTonTextComment(message);
  const invoiceCode = invoiceCodeFromComment(comment);
  const rejectionReason = message.bounced === true ? "bounced" : aborted ? "aborted" : null;
  if (rejectionReason && !invoiceCode) return null;

  return {
    event: {
      network,
      asset_code: "TON",
      transaction_hash: transactionHash,
      logical_time: logicalTime,
      message_index: 0,
      sender_address: senderAddress,
      receiver_address: receiverAddress,
      amount_nano: amountNano,
      comment,
      invoice_code: invoiceCode,
      finalized_at: new Date((transaction.utime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      raw_transaction: transaction as unknown as Json
    },
    rejectionReason
  };
}

function compareTonTransactionsAscending(left: TonCenterTransaction, right: TonCenterTransaction): number {
  const leftLogicalTime = left.transaction_id?.lt;
  const rightLogicalTime = right.transaction_id?.lt;
  if (!leftLogicalTime || !rightLogicalTime) return 0;
  const comparison = BigInt(leftLogicalTime) - BigInt(rightLogicalTime);
  return comparison < BigInt(0) ? -1 : comparison > BigInt(0) ? 1 : 0;
}

async function observeDepositAddress(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  senderAddress: string,
  invoiceCode: string,
  network: string
) {
  const { data: invoice } = await supabase
    .from("ton_deposit_invoices")
    .select("user_id")
    .eq("network", network)
    .eq("asset_code", "TON")
    .eq("invoice_code", invoiceCode)
    .maybeSingle();
  if (!invoice) return;

  await supabase.from("ton_user_wallets").upsert({
    user_id: invoice.user_id,
    network,
    asset_code: "TON",
    normalized_address: senderAddress,
    verification_status: "observed"
  }, { onConflict: "network,asset_code,normalized_address", ignoreDuplicates: true });
}
