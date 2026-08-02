import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { broadcastTonUsdtWithdrawal, loadTonUsdtConfig, normalizeTonUsdtAddress, resolveTonUsdtWithdrawalQuote, TonUsdtWithdrawalBroadcastError } from "@/lib/tonUsdt";
import { loadTonWithdrawalConfig } from "@/lib/tonWithdrawals";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const WITHDRAWAL_SELECT = "id,user_id,network,asset_code,master_address,destination_address,normalized_destination_address,amount_units,amount_usdt,usdt_usd_rate,usdt_rate_provider,usdt_rate_source_timestamp,ton_usd_rate,ton_rate_provider,ton_rate_source_timestamp,payout_wallet_amount,service_fee_percent,service_fee_amount,network_fee_estimate_ton,network_fee_reserve_ton,network_fee_reserve_amount,total_reserved_amount,status,idempotency_key,source_address,seqno,message_hash,transaction_hash,error_code,error_message,refunded_at,broadcast_at,confirmed_at,created_at,updated_at";
type WithdrawalBody = { amountUsdt?: unknown; destinationAddress?: unknown; idempotencyKey?: unknown };
function jsonResponse(body: unknown, init?: ResponseInit) { return NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } }); }

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });
    const config = await loadTonUsdtConfig();
    const signer = loadTonWithdrawalConfig();
    if (!config?.ready) {
      return jsonResponse({ enabled: false, reason: !config ? "disabled" : config.reason, diagnostics: signer.diagnostics });
    }
    const quote = await resolveTonUsdtWithdrawalQuote(config);
    if (!config.withdrawalEnabled) {
      return jsonResponse({ enabled: false, reason: "withdrawal_disabled", quote, diagnostics: signer.diagnostics });
    }
    if (!signer.ready) {
      return jsonResponse({ enabled: false, reason: signer.reason, quote, diagnostics: signer.diagnostics });
    }
    return jsonResponse({ enabled: true, quote });
  } catch (routeError) { return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Could not load TON USDT withdrawal quote." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });
    const config = await loadTonUsdtConfig();
    const signer = loadTonWithdrawalConfig();
    if (!config?.ready || !config.withdrawalEnabled || !signer.ready) return jsonResponse({ error: "TON USDT withdrawal is not configured on this server.", reason: !config ? "disabled" : !config.ready ? config.reason : !config.withdrawalEnabled ? "withdrawal_disabled" : signer.reason, diagnostics: signer.diagnostics }, { status: 503 });
    const body = (await request.json().catch(() => ({}))) as WithdrawalBody;
    const amountUsdt = typeof body.amountUsdt === "string" || typeof body.amountUsdt === "number" ? String(body.amountUsdt).trim() : "";
    const destination = normalizeTonUsdtAddress(body.destinationAddress, config.network);
    if (!destination) return jsonResponse({ error: "Enter a valid TON address." }, { status: 400 });
    const idempotencySuffix = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 100) : crypto.randomUUID();
    const idempotencyKey = `ton_usdt_withdrawal:${user.id}:${idempotencySuffix}`;
    const quote = await resolveTonUsdtWithdrawalQuote(config, amountUsdt);
    if (!quote.amountUsdt || !quote.amountUnits || !quote.payoutWalletAmount || !quote.serviceFeeAmount || !quote.networkFeeReserveAmount || !quote.totalWalletDebitAmount) return jsonResponse({ error: "Could not calculate TON USDT withdrawal fees." }, { status: 422 });
    const withdrawalId = crypto.randomUUID();
    const db = supabase as any;
    const { data: reserveRows, error: reserveError } = await db.rpc("reserve_ton_usdt_withdrawal", {
      p_withdrawal_id: withdrawalId, p_user_id: user.id, p_network: config.network, p_master_address: config.masterAddress,
      p_destination_address: destination.friendly, p_normalized_destination_address: destination.raw, p_amount_units: quote.amountUnits,
      p_amount_usdt: quote.amountUsdt, p_usdt_usd_rate: quote.usdtUsdRate, p_usdt_rate_provider: quote.usdtRateProvider,
      p_usdt_rate_source_timestamp: quote.usdtRateSourceTimestamp, p_ton_usd_rate: quote.tonUsdRate, p_ton_rate_provider: quote.tonRateProvider,
      p_ton_rate_source_timestamp: quote.tonRateSourceTimestamp, p_payout_wallet_amount: quote.payoutWalletAmount,
      p_service_fee_percent: quote.serviceFeePercent, p_service_fee_amount: quote.serviceFeeAmount, p_network_fee_estimate_ton: quote.networkFeeEstimateTon,
      p_network_fee_reserve_ton: quote.networkFeeReserveTon, p_network_fee_reserve_amount: quote.networkFeeReserveAmount,
      p_total_reserved_amount: quote.totalWalletDebitAmount, p_idempotency_key: idempotencyKey
    });
    if (reserveError || !reserveRows?.[0]) return jsonResponse({ error: reserveError?.message ?? "Could not reserve Wallet balance for withdrawal." }, { status: withdrawalErrorStatus(reserveError?.message ?? "") });
    const reservation = reserveRows[0];
    if (!reservation.is_new) return getWithdrawalResponse(db, user.id, reservation.withdrawal_id, 200);
    const { data: claimRows, error: claimError } = await db.rpc("begin_ton_usdt_withdrawal_broadcast", { p_withdrawal_id: reservation.withdrawal_id });
    if (claimError) return jsonResponse({ error: claimError.message }, { status: 500 });
    const claim = claimRows?.[0];
    if (!claim?.claimed) return getWithdrawalResponse(db, user.id, reservation.withdrawal_id, 202);
    let broadcast;
    try {
      broadcast = await broadcastTonUsdtWithdrawal({ config, amountUnits: quote.amountUnits, destinationAddress: destination.raw, comment: `OA USDT withdrawal ${reservation.withdrawal_id}` });
    } catch (broadcastError) {
      const message = broadcastError instanceof Error ? broadcastError.message : "Could not broadcast TON USDT withdrawal.";
      if (broadcastError instanceof TonUsdtWithdrawalBroadcastError && broadcastError.stage === "prepare") {
        await db.rpc("refund_ton_usdt_withdrawal", { p_withdrawal_id: reservation.withdrawal_id, p_error_code: "prepare_failed", p_error_message: message.slice(0, 500) });
        return jsonResponse({ error: message }, { status: 502 });
      }
      await db.rpc("mark_ton_usdt_withdrawal_manual_review", { p_withdrawal_id: reservation.withdrawal_id, p_error_code: "broadcast_unknown", p_error_message: message.slice(0, 500) });
      return jsonResponse({ error: "TON USDT broadcast status is unknown; the request was sent to manual review." }, { status: 503 });
    }
    const { error: completeError } = await db.rpc("complete_ton_usdt_withdrawal_broadcast", { p_withdrawal_id: reservation.withdrawal_id, p_source_address: broadcast.sourceAddress, p_seqno: broadcast.seqno, p_message_hash: broadcast.messageHash });
    if (completeError) return jsonResponse({ error: completeError.message }, { status: 500 });
    return getWithdrawalResponse(db, user.id, reservation.withdrawal_id, 201);
  } catch (routeError) { return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Could not create TON USDT withdrawal." }, { status: 500 }); }
}

async function getWithdrawalResponse(db: any, userId: string, withdrawalId: string, status: number) {
  const { data: withdrawal, error: withdrawalError } = await db.from("ton_usdt_withdrawals").select(WITHDRAWAL_SELECT).eq("id", withdrawalId).eq("user_id", userId).maybeSingle();
  if (withdrawalError) return jsonResponse({ error: withdrawalError.message }, { status: 500 });
  if (!withdrawal) return jsonResponse({ error: "TON USDT withdrawal not found." }, { status: 404 });
  const { data: wallet, error: walletError } = await db.from("wallet_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (walletError) return jsonResponse({ error: walletError.message }, { status: 500 });
  return jsonResponse({ withdrawal: presentWithdrawal(withdrawal), wallet }, { status });
}
function presentWithdrawal(withdrawal: Record<string, unknown>) {
  const numericFields = ["amount_units", "amount_usdt", "usdt_usd_rate", "ton_usd_rate", "payout_wallet_amount", "service_fee_percent", "service_fee_amount", "network_fee_estimate_ton", "network_fee_reserve_ton", "network_fee_reserve_amount", "total_reserved_amount"];
  return numericFields.reduce((result, field) => ({ ...result, [field]: numericString(withdrawal[field]) }), { ...withdrawal });
}
function numericString(value: unknown): string | null { const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null; }
function withdrawalErrorStatus(message: string): number { if (message === "Wallet is not created yet.") return 404; if (message.includes("Insufficient wallet balance") || message.includes("reserve must")) return 400; return 500; }