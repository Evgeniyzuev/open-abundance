import type { Json, Tables, TablesInsert } from "@/lib/database.types";
import { deleteObject, isOwnMediaKey, MEDIA_TYPES, publicMediaUrl, type R2Config } from "@/lib/r2Media";
import type { getAuthenticatedUser } from "@/lib/serverSupabase";

type ServerSupabase = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];

/** The author's own post that may still receive media: a draft of a manual or day post, or an external link post. */
export async function getEditableDraft(supabase: ServerSupabase, postId: string, userId: string) {
  const { data, error } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,post_type,status,deleted_at")
    .eq("id", postId)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.post_type === "external_link") return data;
  // Manual posts and the day post (daily_progress / level_up) accept the author's own photo or video while still a draft.
  return ["manual", "daily_progress", "level_up"].includes(data.post_type) && data.status === "draft" ? data : null;
}

/**
 * Records an uploaded R2 file as the post's first media (replacing the previous one) and removes the replaced
 * file from wherever it lives, R2 or the old Supabase bucket. Media is stored in R2 only; Supabase Storage
 * receives no new files. Throws the database error; on failure the caller removes the new object.
 */
export async function recordR2Media(
  supabase: ServerSupabase,
  config: R2Config,
  input: { postId: string; userId: string; key: string; contentType: string; size: number; durationSeconds?: number | null; templateKey?: string }
): Promise<Tables<"feed_post_media">> {
  const rule = MEDIA_TYPES[input.contentType];
  const { data: previous, error: previousError } = await supabase
    .from("feed_post_media")
    .select("id,storage_path,metadata")
    .eq("post_id", input.postId)
    .eq("sort_order", 0)
    .maybeSingle();
  if (previousError) throw previousError;

  const payload = {
    post_id: input.postId,
    media_type: rule.kind,
    media_url: publicMediaUrl(config, input.key),
    storage_path: null,
    alt_text: {},
    sort_order: 0,
    metadata: {
      origin: "r2",
      key: input.key,
      contentType: input.contentType,
      size: input.size,
      durationSeconds: input.durationSeconds ?? null,
      uploaderUserId: input.userId,
      ...(input.templateKey ? { templateKey: input.templateKey } : {})
    } satisfies Json
  } satisfies TablesInsert<"feed_post_media">;
  const { data: media, error: mediaError } = await supabase
    .from("feed_post_media")
    .upsert(payload, { onConflict: "post_id,sort_order" })
    .select("*")
    .single();
  if (mediaError) throw mediaError;

  const previousMetadata = (previous?.metadata ?? {}) as Record<string, unknown>;
  if (previous?.storage_path) await supabase.storage.from("feed-media").remove([previous.storage_path]);
  if (previousMetadata.origin === "r2" && isOwnMediaKey(previousMetadata.key, input.userId, input.postId) && previousMetadata.key !== input.key) {
    await deleteObject(config, previousMetadata.key).catch(() => false);
  }
  return media;
}
