import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_BODY_LENGTH = 700;

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = await readJsonBody(request);
    const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_BODY_LENGTH) : "";
    const visibility = body.visibility === "private" ? "private" : body.visibility === "public" ? "public" : null;
    if (!visibility) return NextResponse.json({ error: "Choose public or private visibility." }, { status: 400, headers: NO_STORE_HEADERS });
    const { data: post, error: postError } = await supabase
      .from("feed_posts")
      .insert({
        author_user_id: user.id,
        post_type: "manual",
        status: "draft",
        visibility,
        body: text
      } satisfies TablesInsert<"feed_posts">)
      .select("*")
      .single();

    if (postError) return NextResponse.json({ error: postError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: author, error: authorError } = await supabase
      .from("user_profiles")
      .select("user_id,username,display_name,avatar_url,avatar_position,level,created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (authorError) return NextResponse.json({ error: authorError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json({
      post: {
        ...post,
        authorName: author?.display_name ?? author?.username ?? null,
        author: author ?? null,
        statBlocks: [],
        externalLinks: [],
        media: [],
        wish: null,
        projectReview: null,
        systemStory: null,
        verifiedChallenge: null,
        repostOf: null
      }
    }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create manual post." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
