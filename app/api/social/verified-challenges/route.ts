import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to view verified challenges." }, { status: 401, headers: NO_STORE_HEADERS });
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
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const targetUserId = request.nextUrl.searchParams.get("userId") ?? user.id;

  const { data: snapshots, error: snapshotsError } = await (supabase as any)
    .from("challenge_completion_snapshots")
    .select("*")
    .eq("user_id", targetUserId)
    .order("completed_at", { ascending: false });

  if (snapshotsError) {
    return NextResponse.json({ error: snapshotsError.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  // Load feed posts for these snapshots
  const snapshotRows = (snapshots ?? []) as Array<{ id: string; user_id: string; challenge_id: string; challenge_title: any; challenge_category: string | null; verification_type: string | null; completed_at: string; feed_post_id: string | null; created_at: string }>;
  const postIds = snapshotRows
    .map((s) => s.feed_post_id)
    .filter((id): id is string => id !== null);

  let posts: any[] = [];
  if (postIds.length > 0) {
    const { data: feedPosts, error: postsError } = await supabase
      .from("feed_posts")
      .select("*")
      .in("id", postIds)
      .is("deleted_at", null);

    if (!postsError) {
      posts = feedPosts ?? [];
    }
  }

  return NextResponse.json(
    {
      snapshots: snapshots ?? [],
      posts,
      count: (snapshots ?? []).length
    },
    { headers: NO_STORE_HEADERS }
  );
}