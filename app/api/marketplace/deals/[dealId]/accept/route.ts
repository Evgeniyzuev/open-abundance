import { NextRequest } from "next/server";
import { handleMarketplaceDealAction } from "@/lib/marketplaceDealRoute";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export async function POST(request: NextRequest, { params }: { params: { dealId: string } }) { return handleMarketplaceDealAction(request, params.dealId, "accept"); }
