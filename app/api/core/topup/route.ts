import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";

type TopupRequest = {
  amount?: number;
};

type CoreRow = Tables<"core_accounts">;
type WalletRow = Tables<"wallet_accounts">;

type TopupResponse = {
  core: CoreRow;
  wallet: WalletRow;
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

function topupErrorStatus(message: string) {
  if (message === "Wallet is not created yet." || message === "Core is not created yet.") return 404;
  if (message === "Insufficient wallet balance." || message === "Amount must be greater than 0." || message === "Missing user id.") return 400;
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
    return jsonResponse({ error: "Sign in to top up core." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TopupRequest;
  const amount = Number(body.amount);

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

  const sourceId = crypto.randomUUID();
  const { error: topupError } = await supabase.rpc("wallet_core_topup", {
    p_amount: amount,
    p_source_id: sourceId,
    p_user_id: user.id
  });

  if (topupError) {
    const message = topupError.message || "Failed to top up core.";
    return jsonResponse({ error: message }, { status: topupErrorStatus(message) });
  }

  const [walletResult, coreResult] = await Promise.all([
    supabase.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle()
  ]);

  if (walletResult.error) {
    return jsonResponse({ error: walletResult.error.message }, { status: 500 });
  }

  if (coreResult.error) {
    return jsonResponse({ error: coreResult.error.message }, { status: 500 });
  }

  const updatedWallet = walletResult.data;
  const updatedCore = coreResult.data;

  if (!updatedWallet) {
    return jsonResponse({ error: "Wallet is not created yet." }, { status: 404 });
  }

  if (!updatedCore) {
    return jsonResponse({ error: "Core is not created yet." }, { status: 404 });
  }

  const response: TopupResponse = {
    core: updatedCore,
    wallet: updatedWallet
  };

  return jsonResponse(response);
}
