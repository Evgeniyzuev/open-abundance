import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to top up core." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TopupRequest;
  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
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
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  // Get current wallet and core in parallel
  const [walletResult, coreResult] = await Promise.all([
    supabase.from("wallet_accounts").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle()
  ]);

  if (walletResult.error) {
    return NextResponse.json({ error: walletResult.error.message }, { status: 500 });
  }

  if (coreResult.error) {
    return NextResponse.json({ error: coreResult.error.message }, { status: 500 });
  }

  const wallet = walletResult.data;
  const core = coreResult.data;

  if (!wallet) {
    return NextResponse.json({ error: "Wallet is not created yet." }, { status: 404 });
  }

  if (!core) {
    return NextResponse.json({ error: "Core is not created yet." }, { status: 404 });
  }

  if (wallet.balance < amount) {
    return NextResponse.json({ error: "Insufficient wallet balance." }, { status: 400 });
  }

  // Deduct from wallet, add to core
  const now = new Date().toISOString();

  const [walletUpdateResult, coreUpdateResult] = await Promise.all([
    supabase
      .from("wallet_accounts")
      .update({ balance: wallet.balance - amount, updated_at: now })
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle(),
    supabase
      .from("core_accounts")
      .update({ balance: core.balance + amount, updated_at: now })
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle()
  ]);

  if (walletUpdateResult.error) {
    return NextResponse.json({ error: walletUpdateResult.error.message }, { status: 500 });
  }

  if (coreUpdateResult.error) {
    return NextResponse.json({ error: coreUpdateResult.error.message }, { status: 500 });
  }

  const updatedWallet = walletUpdateResult.data;
  const updatedCore = coreUpdateResult.data;

  if (!updatedWallet || !updatedCore) {
    return NextResponse.json({ error: "Failed to update accounts." }, { status: 500 });
  }

  const response: TopupResponse = {
    core: updatedCore,
    wallet: updatedWallet
  };

  return NextResponse.json(response);
}