import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeProfileVisibility } from "@/lib/socialProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PostPatchBody = {
  action?: unknown;
  attitude?: unknown;
  body?: unknown;
  missionRating?: unknown;
  mostUsefulArea?: unknown;
  overallRating?: unknown;
  visibility?: unknown;
  statBlocks?: unknown;
};

type FeedPostRow = Tables<"feed_posts">;

export async function PATCH(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const postId = normalizeUuid(params.postId);
    if (!postId) {
      return NextResponse.json({ error: "Invalid post id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: currentPost, error: currentPostError } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();

    if (currentPostError) return NextResponse.json({ error: currentPostError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!currentPost) return NextResponse.json({ error: "Post not found." }, { status: 404, headers: NO_STORE_HEADERS });
    if (currentPost.author_user_id !== user.id) {
      return NextResponse.json({ error: "Only the author can update this post." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const action = normalizeAction(body.action);
    const nextStatus = getNextStatus(currentPost.status, action);
    const nextBody = normalizeBody(body.body, currentPost.body, currentPost.post_type === "project_review" ? 1500 : 700);
    const nextVisibility = normalizeProfileVisibility(body.visibility, normalizeProfileVisibility(currentPost.visibility));
    const now = new Date().toISOString();

    if (currentPost.post_type === "manual" && nextVisibility !== "public" && nextVisibility !== "private") {
      return NextResponse.json({ error: "Manual posts support only public or private visibility." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (currentPost.post_type === "manual" && nextStatus === "published" && !currentPost.repost_of_post_id && !nextBody) {
      const { count: mediaCount, error: mediaCountError } = await supabase
        .from("feed_post_media")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (mediaCountError) return NextResponse.json({ error: mediaCountError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (!mediaCount) return NextResponse.json({ error: "Add text or media before publishing." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (currentPost.post_type === "project_review" && (!nextBody || nextBody.length < 100)) {
      return NextResponse.json({ error: "A public review must contain 100 to 1500 characters." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: updatedPost, error: updatePostError } = await supabase
      .from("feed_posts")
      .update({
        body: nextBody,
        visibility: nextVisibility,
        status: nextStatus,
        published_at: nextStatus === "published" ? currentPost.published_at ?? now : currentPost.published_at
      })
      .eq("id", postId)
      .select("*")
      .single();

    if (updatePostError) return NextResponse.json({ error: updatePostError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const statBlockUpdates = normalizeStatBlockUpdates(body.statBlocks);
    const statBlockResults = await Promise.all(statBlockUpdates.map((item) => (
      supabase
        .from("feed_post_stat_blocks")
        .update({ visibility: item.visibility })
        .eq("post_id", postId)
        .eq("block_key", item.blockKey)
    )));
    const statBlockError = statBlockResults.find((result) => result.error)?.error;
    if (statBlockError) return NextResponse.json({ error: statBlockError.message }, { status: 500, headers: NO_STORE_HEADERS });

    let projectReview = null;
    if (currentPost.post_type === "project_review") {
      const { data: currentReview, error: currentReviewError } = await supabase
        .from("feed_project_review_metadata")
        .select("*")
        .eq("post_id", postId)
        .maybeSingle();
      if (currentReviewError) return NextResponse.json({ error: currentReviewError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (!currentReview) return NextResponse.json({ error: "Review metadata not found." }, { status: 404, headers: NO_STORE_HEADERS });

      const overallRating = normalizeRating(body.overallRating, currentReview.overall_rating);
      const missionRating = normalizeRating(body.missionRating, currentReview.mission_rating);
      const attitude = normalizeReviewChoice(body.attitude, ["inspired", "interested_questions", "neutral", "skeptical", "not_aligned"], currentReview.attitude);
      const mostUsefulArea = normalizeReviewChoice(body.mostUsefulArea, ["today", "goals", "ai", "wallet", "people", "challenges", "other"], currentReview.most_useful_area);
      const { data: updatedReview, error: reviewUpdateError } = await supabase
        .from("feed_project_review_metadata")
        .update({
          overall_rating: overallRating,
          mission_rating: missionRating,
          attitude,
          most_useful_area: mostUsefulArea
        })
        .eq("post_id", postId)
        .select("post_id,overall_rating,mission_rating,attitude,most_useful_area,challenge_reward_amount,created_at,updated_at")
        .single();
      if (reviewUpdateError) return NextResponse.json({ error: reviewUpdateError.message }, { status: 500, headers: NO_STORE_HEADERS });
      projectReview = updatedReview;
    }

    const { data: statBlocks, error: statBlocksError } = await supabase
      .from("feed_post_stat_blocks")
      .select("*")
      .eq("post_id", postId)
      .order("sort_order", { ascending: true });

    if (statBlocksError) return NextResponse.json({ error: statBlocksError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json(
      { post: { ...updatedPost, projectReview, statBlocks: filterStatBlocksForPost(updatedPost as FeedPostRow, statBlocks ?? []) } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update feed post." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const postId = normalizeUuid(params.postId);
    if (!postId) {
      return NextResponse.json({ error: "Invalid post id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: currentPost, error: currentPostError } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();

    if (currentPostError) return NextResponse.json({ error: currentPostError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!currentPost) return NextResponse.json({ error: "Post not found." }, { status: 404, headers: NO_STORE_HEADERS });
    if (currentPost.author_user_id !== user.id) {
      return NextResponse.json({ error: "Only the author can delete this post." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    if (currentPost.post_type === "manual") {
      const { data: mediaRows, error: mediaError } = await supabase
        .from("feed_post_media")
        .select("storage_path")
        .eq("post_id", postId)
        .not("storage_path", "is", null);
      if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500, headers: NO_STORE_HEADERS });
      const storagePaths = (mediaRows ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path));
      if (storagePaths.length) {
        const { error: storageError } = await supabase.storage.from("feed-media").remove(storagePaths);
        if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500, headers: NO_STORE_HEADERS });
      }
    }

    const { error: deleteError } = await supabase
      .from("feed_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500, headers: NO_STORE_HEADERS });

    return NextResponse.json({ deletedPostId: postId }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to delete feed post." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<PostPatchBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeAction(value: unknown): "publish" | "archive" | "draft" | null {
  if (value === "publish" || value === "archive" || value === "draft") return value;
  return null;
}

function getNextStatus(currentStatus: FeedPostRow["status"], action: "publish" | "archive" | "draft" | null): FeedPostRow["status"] {
  if (action === "publish") return "published";
  if (action === "archive") return "archived";
  if (action === "draft") return "draft";
  return currentStatus;
}

function normalizeBody(value: unknown, fallback: string | null, maxLength: number): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeRating(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : fallback;
}

function normalizeReviewChoice(value: unknown, allowed: string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function normalizeStatBlockUpdates(value: unknown): Array<{ blockKey: string; visibility: "public" | "private" }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      if (typeof record.blockKey !== "string") return null;
      return {
        blockKey: record.blockKey,
        visibility: record.visibility === "public" ? "public" : "private"
      };
    })
    .filter((item): item is { blockKey: string; visibility: "public" | "private" } => Boolean(item));
}

function filterStatBlocksForPost(post: FeedPostRow, statBlocks: Tables<"feed_post_stat_blocks">[]): Tables<"feed_post_stat_blocks">[] {
  if (post.status !== "published") return statBlocks;
  return statBlocks.filter((block) => block.visibility === "public");
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
