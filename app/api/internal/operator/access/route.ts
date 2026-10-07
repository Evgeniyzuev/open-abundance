import { NextRequest, NextResponse } from "next/server";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/internal/operator/access
 *
 * Tells the client whether the signed-in user is a Growth Operator. Everyone else
 * receives the same 404 as for a route that does not exist, so ordinary users
 * cannot tell that an operator console exists.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error || !auth.user || !isGrowthOperator(auth.user.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ operator: true }, { headers: NO_STORE_HEADERS });
}
