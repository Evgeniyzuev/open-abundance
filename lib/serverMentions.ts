import { extractMentions } from "@/lib/mentions";

/**
 * Notifies the people named with @nickname in a public post or comment. Best effort: a failure
 * here must never fail the post or comment itself. One event per mentioned person and source
 * (idempotent), never the author, at most MAX_MENTIONS_PER_TEXT people per text. The event carries
 * only a link, not the text.
 */
export async function notifyMentions(
  db: any,
  input: { text: string | null | undefined; authorId: string; postId: string; sourceKey: string }
): Promise<number> {
  try {
    const names = extractMentions(input.text);
    if (names.length === 0) return 0;
    const { data: people } = await db.from("user_profiles").select("user_id,username").in("username", names).is("deleted_at", null);
    let sent = 0;
    for (const person of people ?? []) {
      if (!person.user_id || person.user_id === input.authorId) continue;
      const { error } = await db.rpc("create_notification_event", {
        p_event_type: "social.mention",
        p_category: "social",
        p_source_type: "feed_post",
        p_source_id: input.postId,
        p_title: "You were mentioned",
        p_body: "Open the post to see the mention.",
        p_deep_link: `/p/${input.postId}`,
        p_recipient_user_ids: [person.user_id],
        p_idempotency_key: `mention:${input.sourceKey}:${person.user_id}`,
        p_metadata: { author_user_id: input.authorId }
      });
      if (!error) sent += 1;
    }
    return sent;
  } catch {
    return 0;
  }
}
