import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type WalletHistoryRow = {
  id: string;
  operation_date: string;
  kind: "daily_core_payout" | "crypto_deposit" | "crypto_withdrawal" | "wallet_transfer" | "marketplace_escrow_hold" | "marketplace_payment" | "marketplace_refund";
  direction: "credit" | "debit";
  amount: number;
  daily_rate?: number;
  gross_amount?: number;
  reinvest_percent?: number;
  network?: string;
  assetCode?: string;
  assetAmount?: string;
  amountUsd?: string;
  usdRate?: string;
  rateProvider?: string;
  transactionHash?: string;
  invoiceStatus?: string;
  serviceFeeUsd?: string;
  networkFeeReserveUsd?: string;
  destinationAddress?: string;
  messageHash?: string;
  counterpartyUserId?: string;
  sourceId?: string;
  created_at: string;
};

type DailyCoreAccrualRow = {
  accrual_date: string;
  daily_rate: number;
  gross_amount: number;
  reinvest_percent: number;
  wallet_amount: number;
  created_at: string;
};

type CryptoDepositLedgerRow = {
  id: string;
  amount: number;
  created_at: string;
  metadata: Record<string, unknown>;
  operation_type: "crypto_deposit" | "crypto_withdrawal";
  direction: "credit" | "debit";
  counterparty_user_id?: string | null;
  source_id?: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

    const { data, error: historyError } = await supabase
      .from("daily_core_accruals")
      .select("accrual_date,daily_rate,gross_amount,reinvest_percent,wallet_amount,created_at")
      .eq("user_id", user.id)
      .gt("wallet_amount", 0)
      .order("accrual_date", { ascending: false })
      .limit(limit);

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const { data: cryptoLedger, error: cryptoError } = await supabase
      .from("wallet_ledger")
      .select("id,amount,created_at,metadata,operation_type,direction,counterparty_user_id,source_id")
      .eq("user_id", user.id)
      .in("operation_type", ["crypto_deposit", "crypto_withdrawal", "wallet_transfer", "marketplace_escrow_hold", "marketplace_payment", "marketplace_refund"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cryptoError) {
      return NextResponse.json({ error: cryptoError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const dailyRows: WalletHistoryRow[] = ((data ?? []) as DailyCoreAccrualRow[]).map((row) => ({
      id: `daily-core:${row.accrual_date}`,
      operation_date: row.accrual_date,
      kind: "daily_core_payout",
      direction: "credit",
      amount: Number(row.wallet_amount),
      daily_rate: Number(row.daily_rate),
      gross_amount: Number(row.gross_amount),
      reinvest_percent: Number(row.reinvest_percent),
      created_at: row.created_at
    }));

    const cryptoRows: WalletHistoryRow[] = ((cryptoLedger ?? []) as CryptoDepositLedgerRow[]).map((row) => ({
      id: row.id,
      operation_date: dateOnly(row.created_at),
      kind: row.operation_type,
      direction: row.direction,
      amount: Number(row.amount),
      amountUsd: row.operation_type === "crypto_deposit"
        ? fixedDecimal(metadataDecimal(row.metadata, "credited_usd_amount") ?? String(row.amount), 6)
        : fixedDecimal(metadataDecimal(row.metadata, "payout_wallet_amount") ?? "0", 6),
      network: metadataString(row.metadata, "network") ?? "mainnet",
      assetCode: metadataString(row.metadata, "asset_code") ?? "TON",
      assetAmount: baseUnitsToDecimal(metadataDecimal(row.metadata, "amount_units") ?? metadataDecimal(row.metadata, "amount_nano"), Number(metadataDecimal(row.metadata, "decimals") ?? "9")),
      usdRate: metadataDecimal(row.metadata, "usdt_usd_rate") ?? metadataDecimal(row.metadata, "ton_usd_rate") ?? undefined,
      rateProvider: metadataString(row.metadata, "rate_provider") ?? undefined,
      transactionHash: metadataString(row.metadata, "transaction_hash") ?? undefined,
      invoiceStatus: metadataString(row.metadata, row.operation_type === "crypto_withdrawal" ? "withdrawal_status" : "invoice_status") ?? undefined,
      serviceFeeUsd: metadataDecimal(row.metadata, "service_fee_amount") ?? undefined,
      networkFeeReserveUsd: metadataDecimal(row.metadata, "network_fee_reserve_amount") ?? undefined,
      destinationAddress: metadataString(row.metadata, "destination_address") ?? undefined,
      messageHash: metadataString(row.metadata, "message_hash") ?? undefined,
      counterpartyUserId: row.counterparty_user_id ?? undefined,
      sourceId: row.source_id ?? undefined,
      created_at: row.created_at
    }));

    const rows = [...dailyRows, ...cryptoRows]
      .sort((left, right) => safeTimestamp(right.created_at) - safeTimestamp(left.created_at))
      .slice(0, limit);

    return NextResponse.json(
      { rows },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load wallet history." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataDecimal(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata?.[key];
  const normalized = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}

function baseUnitsToDecimal(value: string | null, decimals: number): string | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const padded = value.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function fixedDecimal(value: string, decimals: number): string {
  const normalized = /^\d+(?:\.\d+)?$/.test(value) ? value : "0";
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.slice(0, decimals).padEnd(decimals, "0")}`;
}

function dateOnly(value: string): string {
  const timestamp = safeTimestamp(value);
  return timestamp > 0 ? new Date(timestamp).toISOString().slice(0, 10) : value;
}

function safeTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}
