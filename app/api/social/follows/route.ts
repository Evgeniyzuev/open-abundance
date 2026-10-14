import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Whether the viewer follows an author, and how many followers the author has.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const targetUserId = normalizeUuid(request.nextUrl.searchParams.get("userId"));
    if (!targetUserId) return NextResponse.json({ error: "Invalid user id." }, { status: 400, headers: NO_STORE_HEADERS });
    const [own, total] = await Promise.all([
      supabase.from("user_follows").select("follower_user_id", { count: "exact", head: true }).eq("follower_user_id", user.id).eq("followee_user_id", targetUserId),
      supabase.from("user_follows").select("follower_user_id", { count: "exact", head: true }).eq("followee_user_id", targetUserId)
    ]);
    if (own.error) throw own.error;
    if (total.error) throw total.error;
    return NextResponse.json({ following: Boolean(own.count), followersCount: total.count ?? 0 }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load follow." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Follow or unfollow an author. Idempotent: repeating the same request leaves one row or none.
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = await readJsonBody(request);
    const targetUserId = normalizeUuid(body.userId);
    if (!targetUserId) return NextResponse.json({ error: "Invalid user id." }, { status: 400, headers: NO_STORE_HEADERS });
    if (targetUserId === user.id) return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400, headers: NO_STORE_HEADERS });
    const follow = body.follow !== false;

    if (follow) {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", targetUserId)
        .is("deleted_at", null)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

      const { error: upsertError } = await supabase
        .from("user_follows")
        .upsert({ follower_user_id: user.id, followee_user_id: targetUserId }, { onConflict: "follower_user_id,followee_user_id", ignoreDuplicates: true });
      if (upsertError) throw upsertError;
    } else {
      const { error: deleteError } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_user_id", user.id)
        .eq("followee_user_id", targetUserId);
      if (deleteError) throw deleteError;
    }

    const { count, error: countError } = await supabase
      .from("user_follows")
      .select("follower_user_id", { count: "exact", head: true })
      .eq("followee_user_id", targetUserId);
    if (countError) throw countError;

    return NextResponse.json({ following: follow, followersCount: count ?? 0 }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update follow." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<{ userId?: unknown; follow?: unknown }> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
