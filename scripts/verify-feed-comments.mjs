import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCommentThreads, commentNotificationTargets, discussionPath, replyRootId } from "../lib/feedComments.ts";

const c = (id, parent, score, minute) => ({ id, parent_comment_id: parent, score, created_at: `2026-10-25T10:${String(minute).padStart(2, "0")}:00Z` });

// Roots best first, ties by time; replies under their root in time order.
const threads = buildCommentThreads([c("a", null, 1, 1), c("b", null, 3, 2), c("r2", "a", 9, 5), c("r1", "a", 0, 4), c("d", null, 1, 0)]);
assert.deepEqual(threads.map((t) => t.id), ["b", "d", "a"]);
assert.deepEqual(threads[2].replies.map((r) => r.id), ["r1", "r2"]);
assert.deepEqual(threads[0].replies, []);

// A reply whose parent is hidden stays visible as a top-level comment.
assert.deepEqual(buildCommentThreads([c("x", "gone", 0, 1)]).map((t) => t.id), ["x"]);

// One level: a reply to a reply hangs on the branch root.
assert.equal(replyRootId({ id: "a", parent_comment_id: null }), "a");
assert.equal(replyRootId({ id: "r1", parent_comment_id: "a" }), "a");

// Notifications: parent author and post author, never the commenter, no one twice.
assert.deepEqual(commentNotificationTargets({ commenterId: "u1", postAuthorId: "u2", parentAuthorId: "u3" }), [
  { userId: "u3", reason: "reply" },
  { userId: "u2", reason: "post_comment" }
]);
assert.deepEqual(commentNotificationTargets({ commenterId: "u1", postAuthorId: "u2", parentAuthorId: "u2" }), [{ userId: "u2", reason: "reply" }]);
assert.deepEqual(commentNotificationTargets({ commenterId: "u1", postAuthorId: "u1", parentAuthorId: null }), []);
assert.deepEqual(commentNotificationTargets({ commenterId: "u1", postAuthorId: null, parentAuthorId: "u1" }), []);

assert.equal(discussionPath("p1"), "/d/p1");
assert.equal(discussionPath("p1", "c9"), "/d/p1#c-c9");

// The route and the migration stay wired.
const route = readFileSync("app/api/social/feed/posts/[postId]/interactions/route.ts", "utf8");
assert.match(route, /parent_comment_id/);
assert.match(route, /notifyCommentTargets/);
const migration = readFileSync("supabase/migrations/20261025240000_feed_comment_replies.sql", "utf8");
assert.match(migration, /parent_comment_id uuid references public\.feed_post_comments\(id\) on delete cascade/);

console.log("feed comments contract ok");
