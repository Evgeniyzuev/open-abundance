// Counts behind achievements and the first comment / first post quests, read with the service client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { COUNTED_COMMENT_MIN_LENGTH, UNCOUNTED_POST_TYPES, type AchievementCounts } from "@/lib/achievements";

type Client = SupabaseClient<any>;

const PAGE = 1000;

async function countComments(supabase: Client, userId: string): Promise<number> {
  // Short comments do not count, so the bodies are read (a person writes at most a few thousand).
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("feed_post_comments").select("body").eq("user_id", userId).is("deleted_at", null).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    total += (data ?? []).filter((row: { body: string }) => row.body.trim().length >= COUNTED_COMMENT_MIN_LENGTH).length;
    if ((data ?? []).length < PAGE) return total;
  }
}

async function countPosts(supabase: Client, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("feed_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_user_id", userId)
    .eq("status", "published")
    .is("deleted_at", null)
    .not("post_type", "in", `(${UNCOUNTED_POST_TYPES.join(",")})`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function idsOf(supabase: Client, table: string, column: string, userId: string, extra?: (query: any) => any): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select("id").eq(column, userId);
    if (extra) query = extra(query);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    ids.push(...(data ?? []).map((row: { id: string }) => row.id));
    if ((data ?? []).length < PAGE) return ids;
  }
}

/** Likes on others' posts plus ▲ on others' comments, and the same received from other people. */
async function countReactions(supabase: Client, userId: string): Promise<{ given: number; received: number }> {
  const [givenLikes, givenVotes, myPostIds, myCommentIds] = await Promise.all([
    supabase.from("feed_post_likes").select("post_id, feed_posts!inner(author_user_id)", { count: "exact", head: true }).eq("user_id", userId).neq("feed_posts.author_user_id", userId),
    supabase.from("feed_comment_votes").select("comment_id, feed_post_comments!inner(user_id)", { count: "exact", head: true }).eq("user_id", userId).eq("value", 1).neq("feed_post_comments.user_id", userId),
    idsOf(supabase, "feed_posts", "author_user_id", userId, (query) => query.is("deleted_at", null)),
    idsOf(supabase, "feed_post_comments", "user_id", userId, (query) => query.is("deleted_at", null))
  ]);
  if (givenLikes.error) throw new Error(givenLikes.error.message);
  if (givenVotes.error) throw new Error(givenVotes.error.message);

  let received = 0;
  for (let index = 0; index < myPostIds.length; index += 200) {
    const { count, error } = await supabase.from("feed_post_likes").select("id", { count: "exact", head: true }).in("post_id", myPostIds.slice(index, index + 200)).neq("user_id", userId);
    if (error) throw new Error(error.message);
    received += count ?? 0;
  }
  for (let index = 0; index < myCommentIds.length; index += 200) {
    const { count, error } = await supabase.from("feed_comment_votes").select("comment_id", { count: "exact", head: true }).in("comment_id", myCommentIds.slice(index, index + 200)).eq("value", 1).neq("user_id", userId);
    if (error) throw new Error(error.message);
    received += count ?? 0;
  }
  return { given: (givenLikes.count ?? 0) + (givenVotes.count ?? 0), received };
}

export async function loadAchievementCounts(supabase: Client, userId: string): Promise<AchievementCounts> {
  const [comments, posts, reactions] = await Promise.all([countComments(supabase, userId), countPosts(supabase, userId), countReactions(supabase, userId)]);
  return { comments, posts, reactions_given: reactions.given, reactions_received: reactions.received };
}

export { countComments, countPosts };
