import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { cleanSearchTerm } from "@/lib/paymentRequests";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** GET /api/wallet/recipients/search?q=: find people to pay by name or username. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);

  const needle = cleanSearchTerm(request.nextUrl.searchParams.get("q")).replace(/^@/, "");
  if (needle.length < 2) return json({ people: [] }, 200);

  const db = supabase as any;
  const { data, error: searchError } = await db
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,level")
    .is("deleted_at", null)
    .neq("user_id", user.id)
    .or(`display_name.ilike.%${needle}%,username.ilike.%${needle}%`)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (searchError) return json({ error: searchError.message }, 500);
  return json({ people: data ?? [] }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
