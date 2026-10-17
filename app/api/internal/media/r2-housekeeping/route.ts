import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { readR2Config } from "@/lib/r2Media";
import { runHousekeeping } from "@/lib/r2Housekeeping";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Daily housekeeping of the media bucket: reports used space and removes files no post names (older than 24 h).
 * Called by the Vercel cron (GET, Authorization: Bearer CRON_SECRET) or by hand with ?apply=0 for a report only.
 */
async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret");
  if (!expected || !supplied || supplied !== expected) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE_HEADERS });

  const config = readR2Config(process.env);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !supabaseUrl || !serviceKey) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });

  try {
    const apply = request.nextUrl.searchParams.get("apply") !== "0";
    const result = await runHousekeeping({ config, supabaseUrl, serviceKey, apply });
    console.log("r2-housekeeping", JSON.stringify(result));
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Housekeeping failed." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export const GET = handle;
export const POST = handle;
