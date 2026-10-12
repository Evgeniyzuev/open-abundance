import { NextRequest, NextResponse } from "next/server";
import { loadCryptoPayConfig } from "@/lib/cryptoPay";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { loadTonWithdrawalConfig } from "@/lib/tonWithdrawals";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/wallet/fees
 *
 * The project fees people can expect, for the deposit and withdrawal menus and the P2P deal screen. The values
 * come from the same settings the money paths use, so what is shown is what is charged. Network fees are paid to
 * the network, vary with load and are shown in the withdrawal quote before confirmation.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const db = supabase as any;
  const { data: p2p } = await db.from("p2p_risk_configs").select("pilot_fee_percent").eq("is_active", true).maybeSingle();
  const usdtPercent = Number(String(process.env.TON_USDT_SERVICE_FEE_PERCENT ?? "").replace(/["']/g, "").trim());

  return NextResponse.json({
    deposit: { tonPercent: 0, usdtTonPercent: 0, cryptoPayPercent: 0, cryptoPayEnabled: loadCryptoPayConfig().ready },
    withdraw: {
      tonPercent: Number(loadTonWithdrawalConfig().serviceFeePercent),
      usdtTonPercent: Number.isFinite(usdtPercent) && usdtPercent > 0 ? usdtPercent : 1
    },
    p2pPercent: Number(p2p?.pilot_fee_percent ?? 0)
  }, { headers: NO_STORE_HEADERS });
}
