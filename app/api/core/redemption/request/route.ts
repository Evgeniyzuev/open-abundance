import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST() {
  return NextResponse.json(
    { error: "Core is strictly non-decreasing and cannot be redeemed." },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}
