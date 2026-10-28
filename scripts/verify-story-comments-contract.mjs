import assert from "node:assert/strict";
import { findUsefulStoryComment, storyQuestion } from "../lib/storyComments.ts";

const me = "me";
const long = "У меня было так же: работа съедала вечера, пока я не поставил(а) себе жёсткое время окончания.";
const comment = (id, extra = {}) => ({ id, post_id: "p1", user_id: me, body: long, parent_comment_id: null, deleted_at: null, ...extra });
const up = (commentId, userId) => ({ comment_id: commentId, user_id: userId, value: 1 });
const authors = new Map([["p1", "author"], ["own", me]]);

// Three ▲ from three other people: done.
assert.equal(findUsefulStoryComment(me, [comment("c1")], [up("c1", "a"), up("c1", "b"), up("c1", "c")], authors)?.id, "c1");
// Own vote and repeated votes of one person do not count.
assert.equal(findUsefulStoryComment(me, [comment("c1")], [up("c1", "a"), up("c1", "a"), up("c1", me)], authors), null);
// Downvotes do not count.
assert.equal(findUsefulStoryComment(me, [comment("c1")], [up("c1", "a"), up("c1", "b"), { comment_id: "c1", user_id: "c", value: -1 }], authors), null);
// Too short, a reply, or under one's own post: no.
const three = (id) => [up(id, "a"), up(id, "b"), up(id, "c")];
assert.equal(findUsefulStoryComment(me, [comment("c2", { body: "Да, у меня тоже" })], three("c2"), authors), null);
assert.equal(findUsefulStoryComment(me, [comment("c3", { parent_comment_id: "x" })], three("c3"), authors), null);
assert.equal(findUsefulStoryComment(me, [comment("c4", { post_id: "own" })], three("c4"), authors), null);

// Questions: a mapped story gets its own, others the general one; Russian and English.
assert.match(storyQuestion("editorial_story:front-row", "ru"), /вечера/);
assert.match(storyQuestion("editorial_story:front-row", "es"), /evenings/);
assert.match(storyQuestion(null, "ru"), /похожее/);

console.log("story comments contract ok");
