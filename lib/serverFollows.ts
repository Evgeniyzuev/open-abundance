const FOLLOWER_PAGE_SIZE = 500;
const MAX_FOLLOWERS_NOTIFIED = 5000;

/**
 * Tells an author's followers that a reality day was published. Best effort: a failure never fails
 * the publish. One event per post (idempotent), recipients added in bounded pages; the event carries
 * only a link, not the post text.
 */
export async function notifyFollowersOfDay(
  db: any,
  input: { authorId: string; postId: string }
): Promise<number> {
  try {
    let notified = 0;
    for (let offset = 0; offset < MAX_FOLLOWERS_NOTIFIED; offset += FOLLOWER_PAGE_SIZE) {
      const { data, error } = await db
        .from("user_follows")
        .select("follower_user_id")
        .eq("followee_user_id", input.authorId)
        .order("created_at", { ascending: true })
        .range(offset, offset + FOLLOWER_PAGE_SIZE - 1);
      if (error) return notified;
      const recipients = (data ?? []).map((row: { follower_user_id: string }) => row.follower_user_id);
      if (!recipients.length) break;
      const { error: eventError } = await db.rpc("create_notification_event", {
        p_event_type: "social.reality_day",
        p_category: "social",
        p_source_type: "feed_post",
        p_source_id: input.postId,
        p_title: "A new reality day",
        p_body: "Someone you follow published their day.",
        p_deep_link: `/u/${input.authorId}/blog?post=${input.postId}`,
        p_recipient_user_ids: recipients,
        p_idempotency_key: `reality-day:${input.postId}`,
        p_metadata: { author_user_id: input.authorId }
      });
      if (eventError) return notified;
      notified += recipients.length;
      if (recipients.length < FOLLOWER_PAGE_SIZE) break;
    }
    return notified;
  } catch {
    return 0;
  }
}
