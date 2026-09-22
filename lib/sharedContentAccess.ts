import type { NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSharedContentId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export async function getOptionalSharedContentViewer(request: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const authorization = request.headers.get("authorization");
  if (!authorization) return { supabase, userId: null as string | null, authError: false };

  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return { supabase, userId: null as string | null, authError: true };
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return { supabase, userId: null as string | null, authError: true };
  return { supabase, userId: data.user.id, authError: false };
}

export async function getRequiredSharedContentViewer(request: NextRequest) {
  const viewer = await getOptionalSharedContentViewer(request);
  if (!viewer.userId) return { ...viewer, authError: true };
  return viewer;
}

export async function readAuthorizedSharedPost(
  supabase: Awaited<ReturnType<typeof createServiceSupabaseClient>>,
  postId: string,
  viewerUserId: string | null
) {
  const { data: post, error } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,post_type,status,visibility,title,body,created_at,updated_at,published_at,deleted_at")
    .eq("id", postId)
    .eq("post_type", "external_link")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("Could not read shared content.");
  if (!post) return { post: null, reason: "not_found" as const };

  const isOwner = Boolean(viewerUserId && post.author_user_id === viewerUserId);
  const isPublic = post.status === "published" && post.visibility === "public";
  let isRecipient = false;
  if (!isOwner && !isPublic && viewerUserId) {
    const { data: grant, error: grantError } = await supabase
      .from("feed_post_access")
      .select("post_id")
      .eq("post_id", post.id)
      .eq("recipient_user_id", viewerUserId)
      .is("revoked_at", null)
      .maybeSingle();
    if (grantError) throw new Error("Could not verify shared content access.");
    isRecipient = Boolean(grant);
  }

  if (!isOwner && !isPublic && !isRecipient) return { post: null, reason: "not_authorized" as const };
  return { post, reason: null, isOwner, isRecipient, isPublic };
}

export function sameOriginMediaUrl(postId: string, mediaId: string): string {
  return `/api/social/content/${postId}/media?mediaId=${encodeURIComponent(mediaId)}`;
}

