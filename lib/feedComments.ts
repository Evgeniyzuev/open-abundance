// Comment threads under feed posts, Reddit-style with one level of replies. Pure, no imports, so the
// route, the page and `pnpm test:feed-comments` share it.

export const COMMENT_MAX_CHARS = 2000;
/** How many comments one post loads; enough for a full discussion page. */
export const COMMENT_LOAD_LIMIT = 500;

export type ThreadInput = { id: string; parent_comment_id: string | null; score: number; created_at: string };
export type CommentThread<T> = T & { replies: T[] };

/**
 * Top-level comments best first (score, then older first), each with its replies in time order.
 * A reply whose parent is gone or hidden is shown as a top-level comment instead of being lost.
 */
export function buildCommentThreads<T extends ThreadInput>(comments: T[]): Array<CommentThread<T>> {
  const ids = new Set(comments.map((comment) => comment.id));
  const repliesByRoot = new Map<string, T[]>();
  const roots: T[] = [];
  for (const comment of comments) {
    if (comment.parent_comment_id && ids.has(comment.parent_comment_id)) {
      const list = repliesByRoot.get(comment.parent_comment_id) ?? [];
      list.push(comment);
      repliesByRoot.set(comment.parent_comment_id, list);
    } else {
      roots.push(comment);
    }
  }
  return roots
    .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at))
    .map((root) => ({
      ...root,
      replies: (repliesByRoot.get(root.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))
    }));
}

/** The comment a new reply hangs on: replies to a reply go to the top-level comment of that branch. */
export function replyRootId(parent: { id: string; parent_comment_id: string | null }): string {
  return parent.parent_comment_id ?? parent.id;
}

/** Who hears about a new comment: the parent's author and the post author, never the commenter, no one twice. */
export function commentNotificationTargets(input: {
  commenterId: string;
  postAuthorId: string | null;
  parentAuthorId: string | null;
}): Array<{ userId: string; reason: "reply" | "post_comment" }> {
  const targets: Array<{ userId: string; reason: "reply" | "post_comment" }> = [];
  if (input.parentAuthorId && input.parentAuthorId !== input.commenterId) targets.push({ userId: input.parentAuthorId, reason: "reply" });
  if (input.postAuthorId && input.postAuthorId !== input.commenterId && input.postAuthorId !== input.parentAuthorId) {
    targets.push({ userId: input.postAuthorId, reason: "post_comment" });
  }
  return targets;
}

/** Link to a post's discussion page, optionally scrolled to one comment. */
export function discussionPath(postId: string, commentId?: string | null): string {
  return `/d/${postId}${commentId ? `#c-${commentId}` : ""}`;
}
