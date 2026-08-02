import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  broadcastTonWithdrawal,
  isTonWithdrawalAllowed,
  loadTonWithdrawalConfig,
  normalizeTonWithdrawalAddress,
  resolveTonWithdrawalQuote,
  TonWithdrawalBroadcastError
} from "@/lib/tonWithdrawals";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const WITHDRAWAL_SELECT = "id,user_id,network,asset_code,destination_address,normalized_destination_address,amount_nano,amount_ton,ton_usd_rate,rate_provider,rate_source_timestamp,payout_wallet_amount,service_fee_percent,service_fee_amount,network_fee_estimate_ton,network_fee_reserve_ton,network_fee_reserve_amount,total_reserved_amount,status,idempotency_key,source_address,seqno,message_hash,transaction_hash,error_code,error_message,refunded_at,broadcast_at,confirmed_at,created_at,updated_at";

type WithdrawalBody = {
  amountTon?: unknown;
  destinationAddress?: unknown;
  idempotencyKey?: unknown;
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
  try {
    const { user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const config = loadTonWithdrawalConfig();
    if (!config.ready || !isTonWithdrawalAllowed(config, user)) {
      return jsonResponse({ enabled: false, reason: config.reason });
    }

    const quote = await resolveTonWithdrawalQuote(config);
    return jsonResponse({ enabled: true, quote });
  } catch (routeError) {
    return jsonResponse({
      error: routeError instanceof Error ? routeError.message : "Could not load TON withdrawal quote."
    }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const config = loadTonWithdrawalConfig();
    if (!config.ready) return jsonResponse({ error: "TON withdrawal is not configured for testing yet." }, { status: 503 });

    const body = (await request.json().catch(() => ({}))) as WithdrawalBody;
    const amountTon = typeof body.amountTon === "string" ? body.amountTon.trim() : "";
    const destination = normalizeTonWithdrawalAddress(body.destinationAddress, config.network);
    if (!destination) return jsonResponse({ error: "Enter a valid TON address." }, { status: 400 });

    const idempotencySuffix = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 100)
      : crypto.randomUUID();
    const idempotencyKey = `ton_withdrawal:${user.id}:${idempotencySuffix}`;
    const quote = await resolveTonWithdrawalQuote(config, amountTon);
    if (!quote.amountTon || !quote.amountNano || !quote.payoutUsd || !quote.serviceFeeUsd || !quote.networkFeeReserveUsd || !quote.totalWalletDebitUsd) {
      return jsonResponse({ error: "Could not calculate TON withdrawal fees." }, { status: 422 });
    }

    const withdrawalId = crypto.randomUUID();
    const { data: reserveRows, error: reserveError } = await supabase.rpc("reserve_ton_withdrawal", {
      p_withdrawal_id: withdrawalId,
      p_user_id: user.id,
      p_network: config.network,
      p_destination_address: destination.friendly,
      p_normalized_destination_address: destination.raw,
      p_amount_nano: quote.amountNano,
      p_amount_ton: quote.amountTon,
      p_ton_usd_rate: quote.usdRate,
      p_rate_provider: quote.rateProvider,
      p_rate_source_timestamp: quote.rateSourceTimestamp,
      p_payout_wallet_amount: quote.payoutUsd,
      p_service_fee_percent: quote.serviceFeePercent,
      p_service_fee_amount: quote.serviceFeeUsd,
      p_network_fee_estimate_ton: quote.networkFeeEstimateTon,
      p_network_fee_reserve_ton: quote.networkFeeReserveTon,
      p_network_fee_reserve_amount: quote.networkFeeReserveUsd,
      p_total_reserved_amount: quote.totalWalletDebitUsd,
      p_idempotency_key: idempotencyKey
    });

    if (reserveError || !reserveRows?.[0]) {
      const message = reserveError?.message ?? "Could not reserve Wallet balance for withdrawal.";
      return jsonResponse({ error: message }, { status: withdrawalErrorStatus(message) });
    }

    const reservation = reserveRows[0];
    if (!reservation.is_new) {
      return getWithdrawalResponse(supabase, user.id, reservation.withdrawal_id, 200);
    }

    const { data: claimRows, error: claimError } = await supabase.rpc("begin_ton_withdrawal_broadcast", {
      p_withdrawal_id: reservation.withdrawal_id
    });
    if (claimError) return jsonResponse({ error: claimError.message }, { status: 500 });
    const claim = claimRows?.[0];
    if (!claim?.claimed) return getWithdrawalResponse(supabase, user.id, reservation.withdrawal_id, 202);

    let broadcast;
    try {
      broadcast = await broadcastTonWithdrawal({
        config,
        amountTon: quote.amountTon,
        destinationAddress: destination.raw,
        comment: `OA withdrawal ${reservation.withdrawal_id}`
      });
    } catch (broadcastError) {
      const message = broadcastError instanceof Error ? broadcastError.message : "Could not broadcast TON withdrawal.";
      if (broadcastError instanceof TonWithdrawalBroadcastError && broadcastError.stage === "prepare") {
        await supabase.rpc("refund_ton_withdrawal", {
          p_withdrawal_id: reservation.withdrawal_id,
          p_error_code: "prepare_failed",
          p_error_message: message.slice(0, 500)
        });
        return jsonResponse({ error: message }, { status: 502 });
      }

      await supabase.rpc("mark_ton_withdrawal_manual_review", {
        p_withdrawal_id: reservation.withdrawal_id,
        p_error_code: "broadcast_unknown",
        p_error_message: message.slice(0, 500)
      });
      return jsonResponse({ error: "TON broadcast status is unknown; the request was sent to manual review." }, { status: 503 });
    }

    const { error: completeError } = await supabase.rpc("complete_ton_withdrawal_broadcast", {
      p_withdrawal_id: reservation.withdrawal_id,
      p_source_address: broadcast.sourceAddress,
      p_seqno: broadcast.seqno,
      p_message_hash: broadcast.messageHash
    });
    if (completeError) return jsonResponse({ error: completeError.message }, { status: 500 });

    return getWithdrawalResponse(supabase, user.id, reservation.withdrawal_id, 201);
  } catch (routeError) {
    return jsonResponse({
      error: routeError instanceof Error ? routeError.message : "Could not create TON withdrawal."
    }, { status: 500 });
  }
}

async function getWithdrawalResponse(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], userId: string, withdrawalId: string, status: number) {
  const { data: withdrawal, error: withdrawalError } = await supabase
    .from("ton_withdrawals")
    .select(WITHDRAWAL_SELECT)
    .eq("id", withdrawalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (withdrawalError) return jsonResponse({ error: withdrawalError.message }, { status: 500 });
  if (!withdrawal) return jsonResponse({ error: "TON withdrawal not found." }, { status: 404 });

  const { data: wallet, error: walletError } = await supabase
    .from("wallet_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (walletError) return jsonResponse({ error: walletError.message }, { status: 500 });

  return jsonResponse({ withdrawal: presentWithdrawal(withdrawal), wallet }, { status });
}

function presentWithdrawal(withdrawal: Record<string, unknown>) {
  return {
    ...withdrawal,
    amount_nano: numericString(withdrawal.amount_nano),
    amount_ton: numericString(withdrawal.amount_ton),
    ton_usd_rate: numericString(withdrawal.ton_usd_rate),
    payout_wallet_amount: numericString(withdrawal.payout_wallet_amount),
    service_fee_percent: numericString(withdrawal.service_fee_percent),
    service_fee_amount: numericString(withdrawal.service_fee_amount),
    network_fee_estimate_ton: numericString(withdrawal.network_fee_estimate_ton),
    network_fee_reserve_ton: numericString(withdrawal.network_fee_reserve_ton),
    network_fee_reserve_amount: numericString(withdrawal.network_fee_reserve_amount),
    total_reserved_amount: numericString(withdrawal.total_reserved_amount)
  };
}

function numericString(value: unknown): string | null {
  const normalized = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}

function withdrawalErrorStatus(message: string): number {
  if (message === "Wallet is not created yet.") return 404;
  if (message.includes("Insufficient wallet balance") || message.includes("reserve must")) return 400;
  return 500;
}
