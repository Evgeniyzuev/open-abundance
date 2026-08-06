import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (!isUuid(params.userId) || params.userId === user.id) {
      return NextResponse.json({ error: "Invalid recipient user id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("user_id,username,display_name,avatar_url,level")
      .eq("user_id", params.userId)
      .maybeSingle();

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!profile) return NextResponse.json({ error: "Recipient profile not found." }, { status: 404, headers: NO_STORE_HEADERS });
    return NextResponse.json({ recipient: profile }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to resolve recipient." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
