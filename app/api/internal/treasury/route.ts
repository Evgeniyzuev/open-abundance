import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { buildTreasuryCoverageReport } from "@/lib/treasuryCoverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/internal/treasury
 *
 * Operator-only coverage report: Wallet obligations from the ledger against the
 * on-chain balances of the TON reserve (native TON and USDT Jetton). Read-only;
 * it never changes balances.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user || !isGrowthOperator(auth.user.id)) return json({ error: "Not found." }, 404);

  try {
    const report = await buildTreasuryCoverageReport(auth.supabase as never);
    return json(report, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not build the treasury report." }, 500);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
