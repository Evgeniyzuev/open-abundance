import { NextRequest, NextResponse } from "next/server";
import { VOTE_RANKED_POST_IDS, rankComments } from "@/lib/aiEssay";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Tables } from "@/lib/database.types";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { notifyMentions } from "@/lib/serverMentions";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type InteractionAction = "like" | "unlike" | "comment" | "repost" | "vote_comment";
type CommentRow = Tables<"feed_post_comments">;

export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const post = await getVisiblePost(supabase, params.postId);
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404, headers: NO_STORE_HEADERS });
    return NextResponse.json(await loadInteractions(supabase, post.id, user.id), { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load post interactions." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const post = await getVisiblePost(supabase, params.postId);
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const body = await readJsonBody(request);
    const action = normalizeAction(body.action);
    if (!action) return NextResponse.json({ error: "Unknown interaction." }, { status: 400, headers: NO_STORE_HEADERS });
    if (post.status !== "published" || post.visibility !== "public") {
      return NextResponse.json({ error: "Only published public posts can receive interactions." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (action === "like") {
      const { data: insertedLike, error: likeError } = await supabase
        .from("feed_post_likes")
        .upsert({ post_id: post.id, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
        .select("id");
      if (likeError) return NextResponse.json({ error: likeError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (insertedLike?.length) await recordInteractionEvent("feed_post_liked", post, user.id);
    }

    if (action === "unlike") {
      const { data: removedLikes, error: unlikeError } = await supabase
        .from("feed_post_likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .select("id");
      if (unlikeError) return NextResponse.json({ error: unlikeError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (removedLikes?.length) await recordInteractionEvent("feed_post_unliked", post, user.id);
    }

    if (action === "comment") {
      const commentBody = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
      const idempotencyKey = normalizeIdempotencyKey(request.headers.get("Idempotency-Key") ?? body.idempotencyKey);
      if (!commentBody) return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400, headers: NO_STORE_HEADERS });
      if (!idempotencyKey) return NextResponse.json({ error: "Comment request key is missing." }, { status: 400, headers: NO_STORE_HEADERS });

      const { data: existing, error: existingError } = await supabase
        .from("feed_post_comments")
        .select("*")
        .eq("user_id", user.id)
        .eq("client_idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (!existing) {
        const { data: insertedComment, error: commentError } = await supabase.from("feed_post_comments").insert({
          post_id: post.id,
          user_id: user.id,
          body: commentBody,
          client_idempotency_key: idempotencyKey
        }).select("id").single();
        if (commentError && commentError.code !== "23505") {
          return NextResponse.json({ error: commentError.message }, { status: 500, headers: NO_STORE_HEADERS });
        }
        if (!commentError) {
          await recordInteractionEvent("feed_post_commented", post, user.id);
          if (insertedComment?.id) await notifyMentions(supabase, { text: commentBody, authorId: user.id, postId: post.id, sourceKey: `comment:${insertedComment.id}` });
        }
      }
    }

    // Up/down vote on a comment (value 1, -1, or 0 to take the vote back). Not on your own comment.
    if (action === "vote_comment") {
      const commentId = typeof body.commentId === "string" ? body.commentId : "";
      const value = body.value === 1 || body.value === -1 ? body.value : 0;
      const service = createServiceSupabaseClient() as any;
      const { data: comment, error: commentError } = await service
        .from("feed_post_comments")
        .select("id,user_id")
        .eq("id", commentId)
        .eq("post_id", post.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (commentError) return NextResponse.json({ error: commentError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404, headers: NO_STORE_HEADERS });
      if (comment.user_id === user.id) return NextResponse.json({ error: "You cannot vote on your own comment." }, { status: 400, headers: NO_STORE_HEADERS });
      const { error: voteError } = value === 0
        ? await service.from("feed_comment_votes").delete().eq("comment_id", comment.id).eq("user_id", user.id)
        : await service.from("feed_comment_votes").upsert({ comment_id: comment.id, user_id: user.id, value, updated_at: new Date().toISOString() }, { onConflict: "comment_id,user_id" });
      if (voteError) return NextResponse.json({ error: voteError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (action === "repost") {
      const sourcePostId = post.repost_of_post_id ?? post.id;
      const sourcePost = await getVisiblePost(supabase, sourcePostId);
      if (!sourcePost || sourcePost.status !== "published" || sourcePost.visibility !== "public") {
        return NextResponse.json({ error: "The original post is no longer public." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      const commentary = typeof body.body === "string" ? body.body.trim().slice(0, 700) : null;
      const { data: existing, error: existingError } = await supabase
        .from("feed_posts")
        .select("id")
        .eq("author_user_id", user.id)
        .eq("repost_of_post_id", sourcePostId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
      if (!existing) {
        const { error: repostError } = await supabase.from("feed_posts").insert({
          author_user_id: user.id,
          post_type: "manual",
          status: "published",
          visibility: "public",
          body: commentary,
          source_key: "canonical-repost:" + sourcePostId,
          repost_of_post_id: sourcePostId,
          published_at: new Date().toISOString()
        });
        if (repostError && repostError.code !== "23505") {
          return NextResponse.json({ error: repostError.message }, { status: 500, headers: NO_STORE_HEADERS });
        }
        if (!repostError) await recordInteractionEvent("feed_post_reposted", post, user.id);
      }
    }

    return NextResponse.json({
      ...(await loadInteractions(supabase, post.id, user.id)),
      action
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update post interaction." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function getVisiblePost(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], postId: string) {
  const { data, error } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,status,visibility,deleted_at,repost_of_post_id,post_type")
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordInteractionEvent(eventName: string, post: { id: string; post_type: string }, userId: string): Promise<void> {
  await recordProductEvent({
    entityId: post.id,
    entityType: "feed_post",
    eventName,
    properties: { post_type: post.post_type },
    source: "server",
    userId
  });
}

async function loadInteractions(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  postId: string,
  userId: string
) {
  const [likes, viewerLike, comments] = await Promise.all([
    supabase.from("feed_post_likes").select("id", { count: "exact", head: true }).eq("post_id", postId),
    supabase.from("feed_post_likes").select("id").eq("post_id", postId).eq("user_id", userId).maybeSingle(),
    supabase.from("feed_post_comments").select("*").eq("post_id", postId).is("deleted_at", null).order("created_at", { ascending: true }).limit(100)
  ]);
  if (likes.error) throw likes.error;
  if (viewerLike.error) throw viewerLike.error;
  if (comments.error) throw comments.error;

  const commentRows = (comments.data ?? []) as CommentRow[];
  const userIds = Array.from(new Set(commentRows.map((comment) => comment.user_id)));
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from("user_profiles").select("user_id,username,display_name,avatar_url,avatar_position,level,created_at").in("user_id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  // Comment votes; before the votes migration is applied every comment simply scores 0.
  const scoreById = new Map<string, number>();
  const viewerVoteById = new Map<string, number>();
  if (commentRows.length) {
    const { data: votes } = await (createServiceSupabaseClient() as any)
      .from("feed_comment_votes")
      .select("comment_id,user_id,value")
      .in("comment_id", commentRows.map((comment) => comment.id));
    for (const vote of votes ?? []) {
      scoreById.set(vote.comment_id, (scoreById.get(vote.comment_id) ?? 0) + Number(vote.value));
      if (vote.user_id === userId) viewerVoteById.set(vote.comment_id, Number(vote.value));
    }
  }
  const scoredComments = commentRows.map((comment) => ({
    ...comment,
    author: profileById.get(comment.user_id) ?? null,
    score: scoreById.get(comment.id) ?? 0,
    viewerVote: viewerVoteById.get(comment.id) ?? 0,
    own: comment.user_id === userId
  }));

  return {
    likeCount: likes.count ?? 0,
    liked: Boolean(viewerLike.data),
    voteRanked: VOTE_RANKED_POST_IDS.has(postId),
    comments: VOTE_RANKED_POST_IDS.has(postId) ? rankComments(scoredComments) : scoredComments
  };
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeAction(value: unknown): InteractionAction | null {
  return value === "like" || value === "unlike" || value === "comment" || value === "repost" || value === "vote_comment" ? value : null;
}

function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key ? key.slice(0, 120) : null;
}
