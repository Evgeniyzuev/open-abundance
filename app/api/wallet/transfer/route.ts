import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";

type TransferRequest = {
  amount?: number;
  idempotencyKey?: string;
  recipientUserId?: string;
};

type WalletRow = Tables<"wallet_accounts">;

type TransferResponse = {
  transfer: {
    amount: number;
    recipientUserId: string;
    senderWalletLedgerId: string | null;
    recipientWalletLedgerId: string | null;
    sourceId: string;
    idempotencyKey: string;
    sender: { userId: string; ledgerId: string | null; balanceAfter: number | null };
    recipient: { userId: string; username: string | null; displayName: string | null; level: number; ledgerId: string | null; balanceAfter: number | null };
  };
  wallet: WalletRow;
};

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

function transferErrorStatus(message: string) {
  if (message === "Sender Wallet is not created yet." || message === "Recipient Wallet is not created yet.") return 404;
  if (
    message === "Cannot transfer Wallet to yourself."
    || message === "Amount must be greater than 0."
    || message === "Insufficient wallet balance."
    || message === "Missing wallet transfer user id."
    || message === "Unsupported wallet transfer source type."
    || message === "Amount exceeds $ precision."
    || message === "Wallet transfer idempotency state is incomplete."
    || message === "Idempotency key is required."
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return jsonResponse({ error: "Sign in to transfer Wallet." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TransferRequest;
  const recipientUserId = body.recipientUserId;
  const amount = Number(body.amount);

  if (!recipientUserId || !isUuid(recipientUserId)) {
    return jsonResponse({ error: "Invalid recipient user id." }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "Amount must be greater than 0." }, { status: 400 });
  }
  if (!hasWalletPrecision(body.amount)) {
    return jsonResponse({ error: "Amount exceeds $ precision." }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonResponse({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, user.id);
  if (!idempotencyKey) {
    return jsonResponse({ error: "Idempotency key is required." }, { status: 400 });
  }

  if (recipientUserId === user.id) {
    return jsonResponse({ error: "Cannot transfer Wallet to yourself." }, { status: 400 });
  }

  const { data: recipientProfile, error: recipientProfileError } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,level")
    .eq("user_id", recipientUserId)
    .maybeSingle();
  if (recipientProfileError) return jsonResponse({ error: recipientProfileError.message }, { status: 500 });
  if (!recipientProfile) return jsonResponse({ error: "Recipient profile not found." }, { status: 404 });

  const sourceId = crypto.randomUUID();
  const { data: transferRows, error: transferError } = await supabase.rpc("wallet_transfer", {
    p_amount: amount,
    p_idempotency_key: idempotencyKey ?? undefined,
    p_recipient_user_id: recipientUserId,
    p_sender_user_id: user.id,
    p_source_id: sourceId,
    p_source_type: "wallet_transfer"
  });

  if (transferError) {
    const message = transferError.message || "Failed to transfer Wallet.";
    return jsonResponse({ error: message }, { status: transferErrorStatus(message) });
  }

  const { data: wallet, error: walletError } = await supabase
    .from("wallet_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (walletError) {
    return jsonResponse({ error: walletError.message }, { status: 500 });
  }

  if (!wallet) {
    return jsonResponse({ error: "Sender Wallet is not created yet." }, { status: 404 });
  }

  const { data: recipientWallet, error: recipientWalletError } = await supabase
    .from("wallet_accounts")
    .select("*")
    .eq("user_id", recipientUserId)
    .maybeSingle();
  if (recipientWalletError) return jsonResponse({ error: recipientWalletError.message }, { status: 500 });
  if (!recipientWallet) return jsonResponse({ error: "Recipient Wallet is not created yet." }, { status: 404 });

  const transferRow = transferRows?.[0];
  const ledgerIds = [transferRow?.sender_wallet_ledger_id, transferRow?.recipient_wallet_ledger_id].filter(Boolean);
  const { data: ledgerRows, error: ledgerError } = ledgerIds.length
    ? await supabase.from("wallet_ledger").select("id,source_id,user_id,balance_after").in("id", ledgerIds)
    : { data: [], error: null };
  if (ledgerError) return jsonResponse({ error: ledgerError.message }, { status: 500 });
  const canonicalSourceId = ledgerRows?.find((row) => row.id === transferRow?.sender_wallet_ledger_id)?.source_id ?? sourceId;
  const senderLedger = ledgerRows?.find((row) => row.id === transferRow?.sender_wallet_ledger_id);
  const recipientLedger = ledgerRows?.find((row) => row.id === transferRow?.recipient_wallet_ledger_id);
  const response: TransferResponse = {
    transfer: {
      amount,
      recipientUserId,
      senderWalletLedgerId: transferRow?.sender_wallet_ledger_id ?? null,
      recipientWalletLedgerId: transferRow?.recipient_wallet_ledger_id ?? null,
      sourceId: canonicalSourceId,
      idempotencyKey,
      sender: { userId: user.id, ledgerId: transferRow?.sender_wallet_ledger_id ?? null, balanceAfter: senderLedger?.balance_after ?? null },
      recipient: {
        userId: recipientUserId,
        username: recipientProfile.username,
        displayName: recipientProfile.display_name,
        level: recipientProfile.level,
        ledgerId: transferRow?.recipient_wallet_ledger_id ?? null,
        balanceAfter: recipientLedger?.balance_after ?? null
      }
    },
    wallet
  };

  return jsonResponse(response);
}

function normalizeIdempotencyKey(value: unknown, userId: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? `wallet_transfer:${userId}:${normalized}`.slice(0, 200) : null;
}

function hasWalletPrecision(value: unknown): boolean {
  const text = typeof value === "number" ? value.toString() : typeof value === "string" ? value.trim().replace(",", ".") : "";
  const fraction = text.split(".")[1] ?? "";
  return fraction.length <= 12;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
