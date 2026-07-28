import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type WalletHistoryRow = {
  id: string;
  operation_date: string;
  kind: "daily_core_payout" | "crypto_deposit";
  amount: number;
  daily_rate?: number;
  gross_amount?: number;
  reinvest_percent?: number;
  network?: string;
  transaction_hash?: string;
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
};

export const dynamic = "force-dynamic";

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
      .select("id,amount,created_at,metadata")
      .eq("user_id", user.id)
      .eq("operation_type", "crypto_deposit")
      .eq("direction", "credit")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cryptoError) {
      return NextResponse.json({ error: cryptoError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const dailyRows: WalletHistoryRow[] = ((data ?? []) as DailyCoreAccrualRow[]).map((row) => ({
      id: `daily-core:${row.accrual_date}`,
      operation_date: row.accrual_date,
      kind: "daily_core_payout",
      amount: Number(row.wallet_amount),
      daily_rate: Number(row.daily_rate),
      gross_amount: Number(row.gross_amount),
      reinvest_percent: Number(row.reinvest_percent),
      created_at: row.created_at
    }));

    const cryptoRows: WalletHistoryRow[] = ((cryptoLedger ?? []) as CryptoDepositLedgerRow[]).map((row) => ({
      id: row.id,
      operation_date: row.created_at,
      kind: "crypto_deposit",
      amount: Number(row.amount),
      network: typeof row.metadata?.network === "string" ? row.metadata.network : "TON",
      transaction_hash: typeof row.metadata?.transaction_hash === "string" ? row.metadata.transaction_hash : undefined,
      created_at: row.created_at
    }));

    const rows = [...dailyRows, ...cryptoRows]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
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

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}
