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
