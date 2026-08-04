import { NextRequest, NextResponse } from "next/server";
import { Address, Cell, TonClient } from "@ton/ton";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import type { Json } from "@/lib/database.types";
import { loadTonUsdtConfig } from "@/lib/tonUsdt";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TonCenterPayload = { ok?: boolean; result?: TonCenterTransaction[]; previous_transaction?: { lt?: string; hash?: string }; error?: string; description?: string };
type TonCenterTransaction = {
  utime?: number;
  transaction_id?: { hash?: string; lt?: string };
  description?: Record<string, unknown> | null;
  in_msg?: { source?: string | null; destination?: string | null; msg_data?: { body?: string; text?: string } | null; bounced?: boolean } | null;
  out_msgs?: unknown[];
};
type ParsedEvent = { event: Record<string, unknown>; rejectionReason: "bounced" | "aborted" | null };

function jsonResponse(body: unknown, init?: ResponseInit) { return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } }); }
export async function GET(request: NextRequest) { return scan(request); }
export async function POST(request: NextRequest) { return scan(request); }

async function scan(request: NextRequest) {
  const scannerSecret = process.env.TON_SCANNER_SECRET?.trim();
  if (!scannerSecret) return jsonResponse({ error: "TON scanner is not configured." }, { status: 503 });
  if (request.headers.get("x-ton-scanner-secret")?.trim() !== scannerSecret) return jsonResponse({ error: "Unauthorized TON USDT scanner request." }, { status: 401 });
  const supabase = createServiceSupabaseClient() as any;
  let leaseId: string | null = null;
  try {
    const config = await loadTonUsdtConfig(supabase);
    if (!config?.ready) return jsonResponse({ error: "TON USDT deposit is not configured yet.", reason: config?.reason ?? "disabled" }, { status: 503 });
    const { data: claimedLease, error: leaseError } = await supabase.rpc("claim_ton_chain_scan", { p_network: config.network, p_deposit_address: config.depositJettonWalletAddress });
    if (leaseError) throw new Error(leaseError.message);
    leaseId = claimedLease;
    if (!leaseId) return jsonResponse({ network: config.network, assetCode: "USDT", skipped: true, reason: "scan_already_running" });
    const { data: cursor, error: cursorError } = await supabase.from("ton_usdt_chain_cursors").select("last_logical_time,last_transaction_hash").eq("network", config.network).eq("master_address", config.masterAddress).eq("deposit_jetton_wallet_address", config.depositJettonWalletAddress).maybeSingle();
    if (cursorError) throw new Error(cursorError.message);
    const page = await loadTransactions(config.endpoint, config.depositJettonWalletAddress, cursor?.last_logical_time ?? null);
    if (!cursor) {
      if (page.latestLogicalTime) await saveCursor(supabase, config, page.latestLogicalTime, page.latestTransactionHash);
      return jsonResponse({ network: config.network, assetCode: "USDT", skipped: true, reason: "cursor_initialized", cursor: page.latestLogicalTime });
    }
    const transactions = page.transactions.filter((tx) => {
      const lt = tx.transaction_id?.lt?.trim();
      return Boolean(lt && /^\d+$/.test(lt) && BigInt(lt) > BigInt(cursor.last_logical_time));
    }).sort(compareTransactionsAscending);
    if (!transactions.length) return jsonResponse({ network: config.network, assetCode: "USDT", scanned: 0, inserted: 0, skipped: true, reason: "no_new_transactions" });
    const client = new TonClient({ endpoint: config.rpcEndpoint, apiKey: config.apiKey, timeout: 15_000 });
    let inserted = 0;
    let ignored = 0;
    for (const transaction of transactions) {
      const parsed = parseIncomingNotification(transaction, config);
      if (!parsed) { ignored += 1; continue; }
      const sourceVerified = await verifyJettonWalletSource(client, parsed.event.source_jetton_wallet_address as string, parsed.event.sender_owner_address as string | null, config.masterAddress);
      if (!sourceVerified) { ignored += 1; continue; }
      const { data: stored, error: insertError } = await supabase.from("ton_usdt_chain_events").insert({
        ...parsed.event,
        rejection_reason: parsed.rejectionReason,
        status: parsed.rejectionReason ? "failed" : "awaiting_rate"
      }).select("id").single();
      if (insertError?.code === "23505") {
        const { data: existing, error: existingError } = await supabase.from("ton_usdt_chain_events").select("id,status").eq("network", config.network).eq("master_address", config.masterAddress).eq("transaction_hash", parsed.event.transaction_hash).eq("logical_time", parsed.event.logical_time).eq("message_index", parsed.event.message_index).single();
        if (existingError || !existing) throw new Error(existingError?.message ?? "Failed to reload an existing TON USDT chain event.");
        if (["awaiting_rate", "finalized"].includes(existing.status)) {
          const { error: retryError } = await supabase.rpc("enqueue_ton_usdt_deposit_settlement_retry", { p_chain_event_id: existing.id });
          if (retryError) throw new Error(retryError.message);
        }
        ignored += 1;
        continue;
      }
      if (insertError || !stored) throw new Error(insertError?.message ?? "Failed to store TON USDT chain event.");
      inserted += 1;
      if (!parsed.rejectionReason) {
        const { error: retryError } = await supabase.rpc("enqueue_ton_usdt_deposit_settlement_retry", { p_chain_event_id: stored.id });
        if (retryError) throw new Error(retryError.message);
      }
    }
    if (page.latestLogicalTime) await saveCursor(supabase, config, page.latestLogicalTime, page.latestTransactionHash);
    return jsonResponse({ network: config.network, assetCode: "USDT", scanned: transactions.length, inserted, ignored, cursor: page.latestLogicalTime });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to scan TON USDT deposits." }, { status: 500 });
  } finally {
    if (leaseId) await supabase.rpc("release_ton_chain_scan", { p_run_id: leaseId });
  }
}

async function saveCursor(supabase: any, config: Awaited<ReturnType<typeof loadTonUsdtConfig>> extends infer T ? Exclude<T, null> : never, logicalTime: string, transactionHash: string | null) {
  const { error } = await supabase.from("ton_usdt_chain_cursors").upsert({ network: config.network, master_address: config.masterAddress, deposit_jetton_wallet_address: config.depositJettonWalletAddress, last_logical_time: logicalTime, last_transaction_hash: transactionHash, updated_at: new Date().toISOString() }, { onConflict: "network,master_address,deposit_jetton_wallet_address" });
  if (error) throw new Error(error.message);
}

async function loadTransactions(apiUrl: string, address: string, cursorLogicalTime: string | null) {
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
    const url = new URL(`${apiUrl.replace(/\/+$/, "")}/getTransactions`);
    url.searchParams.set("address", address); url.searchParams.set("limit", "100");
    if (cursorLogicalTime) url.searchParams.set("to_lt", cursorLogicalTime);
    if (nextLogicalTime && nextHash) { url.searchParams.set("lt", nextLogicalTime); url.searchParams.set("hash", nextHash); }
    const response = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
    const payload = (await response.json().catch(() => ({}))) as TonCenterPayload;
    if (!response.ok || payload.ok === false) throw new Error(payload.error ?? payload.description ?? `TON Center request failed (${response.status}).`);
    const pageTransactions = Array.isArray(payload.result) ? payload.result : [];
    for (const transaction of pageTransactions) {
      const lt = transaction.transaction_id?.lt?.trim(); const hash = transaction.transaction_id?.hash?.trim();
      if (!lt || !hash || !/^\d+$/.test(lt)) continue;
      transactions.set(`${lt}:${hash}`, transaction);
      if (!latestLogicalTime || BigInt(lt) > BigInt(latestLogicalTime)) { latestLogicalTime = lt; latestTransactionHash = hash; }
      if (cursorLogicalTime && BigInt(lt) <= BigInt(cursorLogicalTime)) reachedCursor = true;
    }
    if (!pageTransactions.length || reachedCursor) break;
    nextLogicalTime = payload.previous_transaction?.lt?.trim() ?? null; nextHash = payload.previous_transaction?.hash?.trim() ?? null;
    if (!nextLogicalTime || !nextHash || !/^\d+$/.test(nextLogicalTime)) break;
    if (cursorLogicalTime && BigInt(nextLogicalTime) <= BigInt(cursorLogicalTime)) break;
  }
  if (cursorLogicalTime && !reachedCursor && transactions.size >= 2_000) throw new Error("TON USDT transaction pagination limit was reached before the saved cursor.");
  return { transactions: [...transactions.values()], latestLogicalTime, latestTransactionHash };
}

function parseIncomingNotification(transaction: TonCenterTransaction, config: NonNullable<Awaited<ReturnType<typeof loadTonUsdtConfig>>>): ParsedEvent | null {
  const transactionHash = transaction.transaction_id?.hash?.trim();
  const logicalTime = transaction.transaction_id?.lt?.trim();
  const message = transaction.in_msg;
  const receiver = normalizeRawAddress(message?.destination);
  const expectedReceiver = normalizeRawAddress(config.depositJettonWalletAddress);
  const source = normalizeRawAddress(message?.source);
  if (!transactionHash || !logicalTime || !/^\d+$/.test(logicalTime) || !message || !receiver || receiver !== expectedReceiver || !source) return null;
  const parsedBody = parseNotificationBody(message.msg_data?.body);
  if (!parsedBody) return null;
  const description = transaction.description;
  const computePhase = description?.compute_phase as Record<string, unknown> | undefined;
  const exitCode = typeof computePhase?.exit_code === "number" ? computePhase.exit_code : null;
  const aborted = description?.aborted === true || (exitCode !== null && exitCode !== 0);
  const rejectionReason = message.bounced === true ? "bounced" : aborted ? "aborted" : null;
  return {
    event: {
      network: config.network,
      asset_code: "USDT",
      master_address: config.masterAddress,
      transaction_hash: transactionHash,
      logical_time: logicalTime,
      message_index: 0,
      source_jetton_wallet_address: source,
      receiver_jetton_wallet_address: receiver,
      sender_owner_address: parsedBody.sender,
      amount_units: parsedBody.amountUnits,
      comment: parsedBody.comment,
      invoice_code: invoiceCodeFromComment(parsedBody.comment),
      finalized_at: new Date((transaction.utime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      raw_transaction: transaction as unknown as Json
    },
    rejectionReason
  };
}

function parseNotificationBody(body: string | undefined): { amountUnits: string; sender: string | null; comment: string | null } | null {
  if (!body) return null;
  try {
    const roots = Cell.fromBoc(Buffer.from(body, "base64"));
    if (!roots[0]) return null;
    const slice = roots[0].beginParse();
    if (slice.loadUint(32) !== 0x7362d09c) return null;
    slice.loadUintBig(64);
    const amountUnits = slice.loadCoins().toString();
    const senderAddress = slice.loadAddress();
    const payload = slice.loadBit() ? slice.loadRef().beginParse() : slice;
    let comment: string | null = null;
    if (payload.remainingBits >= 32 && payload.loadUint(32) === 0 && payload.remainingBits % 8 === 0 && payload.remainingBits > 0) {
      comment = payload.loadBuffer(payload.remainingBits / 8).toString("utf8").replace(/\u0000+$/, "").trim() || null;
    }
    return { amountUnits, sender: senderAddress ? normalizeRawAddress(senderAddress.toRawString()) : null, comment };
  } catch {
    return null;
  }
}

async function verifyJettonWalletSource(client: TonClient, sourceAddress: string, senderOwnerAddress: string | null, masterAddress: string): Promise<boolean> {
  if (!senderOwnerAddress) return false;
  try {
    const result = await client.runMethod(Address.parse(sourceAddress), "get_wallet_data");
    result.stack.readBigNumber();
    const owner = result.stack.readAddress();
    const master = result.stack.readAddress();
    return owner.toRawString() === senderOwnerAddress && master.toRawString() === normalizeRawAddress(masterAddress);
  } catch {
    return false;
  }
}

function invoiceCodeFromComment(comment: string | null): string | null {
  if (!comment) return null;
  const normalized = comment.trim();
  return /^oa_usdt_[a-f0-9-]{20,80}$/i.test(normalized) ? normalized : null;
}
function normalizeRawAddress(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return Address.parse(value.trim()).toRawString(); } catch { return null; }
}
function compareTransactionsAscending(left: TonCenterTransaction, right: TonCenterTransaction): number {
  const a = left.transaction_id?.lt; const b = right.transaction_id?.lt;
  if (!a || !b) return 0; const result = BigInt(a) - BigInt(b); return result < BigInt(0) ? -1 : result > BigInt(0) ? 1 : 0;
}