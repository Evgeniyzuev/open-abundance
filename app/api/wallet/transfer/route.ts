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
    sourceId: string;
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
    || message === "Wallet transfer idempotency state is incomplete."
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

  if (recipientUserId === user.id) {
    return jsonResponse({ error: "Cannot transfer Wallet to yourself." }, { status: 400 });
  }

  const sourceId = crypto.randomUUID();
  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, user.id);
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

  const transferRow = transferRows?.[0];
  const response: TransferResponse = {
    transfer: {
      amount,
      recipientUserId,
      senderWalletLedgerId: transferRow?.sender_wallet_ledger_id ?? null,
      sourceId
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
