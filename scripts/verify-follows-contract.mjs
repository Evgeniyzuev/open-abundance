import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Schema: one row per pair, no self-follow, reads limited to the two sides, writes only through the server.
const sql = readFileSync("supabase/migrations/20261014100000_user_follows.sql", "utf8");
assert.match(sql, /primary key \(follower_user_id, followee_user_id\)/);
assert.match(sql, /check \(follower_user_id <> followee_user_id\)/);
assert.match(sql, /on public\.user_follows \(followee_user_id, created_at desc\)/);
assert.match(sql, /revoke all on table public\.user_follows from anon, authenticated;/);
assert.match(sql, /grant select on table public\.user_follows to authenticated;/);
assert.doesNotMatch(sql, /grant (insert|update|delete)/);
assert.match(sql, /using \(\(select auth\.uid\(\)\) = follower_user_id or \(select auth\.uid\(\)\) = followee_user_id\)/);

// API: idempotent follow/unfollow, never yourself.
const api = readFileSync("app/api/social/follows/route.ts", "utf8");
assert.match(api, /targetUserId === user\.id/);
assert.match(api, /ignoreDuplicates: true/);
assert.match(api, /\.delete\(\)\s*\.eq\("follower_user_id", user\.id\)/);

// Signed-out visitors: only an author's public blog and the public part of a profile.
const feed = readFileSync("app/api/social/feed/route.ts", "utf8");
assert.match(feed, /if \(!user && !\(publicBlog && requestedAuthorId\)\)/);
const getHandler = feed.slice(feed.indexOf("export async function GET"), feed.indexOf("export async function POST"));
assert.doesNotMatch(getHandler, /user\.id/, "GET uses the nullable viewer id");
assert.match(feed, /if \(category === "following"\)/);
assert.match(feed, /\.limit\(500\)/, "followee list is bounded");

const profile = readFileSync("app/api/social/profile/[userId]/route.ts", "utf8");
assert.match(profile, /if \(!viewerUserId\) return \{ isSelf: false, isContact: false, isTeam: false, isFollower: false \}/);
assert.match(profile, /followersCount: followersResult\.count \?\? 0/);
assert.match(profile, /if \(!viewerUserId\) return wishes\.map\(\(wish\) => \(\{ \.\.\.wish, viewer_has_copy: false \}\)\)/);

// Followers hear about a published day once per post; the event carries only a link.
const posts = readFileSync("app/api/social/feed/posts/[postId]/route.ts", "utf8");
assert.match(posts, /currentPost\.post_type === "daily_progress" \|\| currentPost\.post_type === "level_up"/);
const follows = readFileSync("lib/serverFollows.ts", "utf8");
assert.match(follows, /p_idempotency_key: `reality-day:\$\{input\.postId\}`/);
assert.match(follows, /MAX_FOLLOWERS_NOTIFIED/);
const notifications = readFileSync("app/api/notifications/route.ts", "utf8");
assert.match(notifications, /eventType === "social\.reality_day" \? "realityDay"/);

// Client: the public blog request works without a session; the cabinet still requires one.
const blog = readFileSync("components/BlogWorkspace.tsx", "utf8");
assert.match(blog, /optionalAuth: view === "public"/);
const page = readFileSync("components/PublicUserPage.tsx", "utf8");
assert.doesNotMatch(page, /profile\.registrationRequired/);
assert.match(page, /href="\/\?auth=signin"/);

const i18n = readFileSync("lib/i18n.ts", "utf8");
for (const key of ["social.feed.filter.following", "social.follow.follow", "social.follow.following", "social.follow.followers", "social.follow.signInToFollow", "notifications.event.realityDay.title"]) {
  assert.equal(i18n.split(`"${key}"`).length - 1, 2, `${key} exists in RU and EN`);
}

// Follow from a post: shown for other real authors only; state comes from GET /api/social/follows.
assert.match(api, /export async function GET/);
const social = readFileSync("components/SocialApp.tsx", "utf8");
assert.match(social, /post\.post_type !== "reality_demo" && post\.post_type !== "abundance_story" \? <FollowButton/);
assert.match(readFileSync("components/FollowButton.tsx", "utf8"), /viewerId === authorId/);

console.log("follows contract ok");
