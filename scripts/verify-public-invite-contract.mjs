import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The invitation link leads to the inviter's public page and carries the code; a nickname link keeps the query.
const me = read("app/api/referrals/me/route.ts");
assert.ok(me.includes("`/@${inviter.username}/blog`") && me.includes("`/u/${user.id}/blog`") && me.includes('url.searchParams.set("ref", code)'), "the referral link opens the inviter's public blog with ?ref=");
assert.ok(read("lib/usernameRedirect.ts").includes("searchParams.toString()"), "/@nickname?ref=... keeps its query when redirecting");

// Public pages work without a session: the pages do not require sign-in and the provider stores the code from ?ref= on any path.
assert.ok(!/redirect\(/.test(read("app/u/[userId]/page.tsx")) && !/redirect\([^)]*auth/.test(read("app/u/[userId]/blog/page.tsx")), "profile and blog pages do not send guests to sign in");
const provider = read("components/UserProvider.tsx");
assert.ok(provider.includes('params.get("ref")') && provider.includes("capturePendingReferral("), "the code is remembered on the device from any page");

// The guest sees an invitation to join; it says the invitation is saved when a code is stored.
const page = read("components/PublicUserPage.tsx");
const panel = read("components/GuestJoinPanel.tsx");
assert.ok(panel.includes("public-join-banner") && panel.includes("readLocalGuest") && panel.includes("user)") && page.includes("<GuestJoinPanel />") && read("components/PublicFeedPage.tsx").includes("<GuestJoinPanel />"), "guests see the join panel on the profile, the blog and the feed");
for (const key of ["public.join.title", "public.join.text", "public.join.invited", "public.join.cta", "public.join.signIn"]) assert.ok(read("lib/messages/en.ts").includes(`"${key}"`) && read("lib/messages/ru.ts").includes(`"${key}"`), `${key} exists in both languages`);

// Wallet history: the counterparty is a name that opens the public profile, with the short id only as a fallback.
const history = read("components/wallet/HistoryCounterparty.tsx");
assert.ok(history.includes("href={`/u/${row.counterpartyUserId}`}") && history.includes("row.counterpartyName || shortId("), "the counterparty is a profile link");
assert.ok(read("app/api/wallet/history/route.ts").includes("counterpartyName") && read("app/api/wallet/history/route.ts").includes('.from("user_profiles").select("user_id,display_name,username")'), "the history API resolves names");
assert.ok(!read("components/WalletApp.tsx").includes("shortId(row.counterpartyUserId)"), "the screen no longer prints the raw id");
// Everyone signed in has an invitation link at once; the guest panel offers both ways in.
assert.ok(!me.includes("first_result_required") && !me.includes("hasFirstResult"), "the invitation link has no first-result gate");
assert.ok(panel.includes('href="/?auth=signin"') && panel.includes('href="/"') && panel.includes("public-join-actions"), "the guest panel has sign in and join buttons");

// The blog comes first, the profile and the feed are one tap away; guests may read the public feed and nothing personal.
assert.ok(page.indexOf('href={`/u/${userId}/blog`}') < page.indexOf('href={`/u/${userId}`}') && page.includes('href="/feed"'), "tabs: blog, profile, feed");
assert.ok(read("next.config.mjs").includes("/@:username/blog") && read("app/u/by-username/[username]/blog/route.ts").includes("redirectToProfile(request, params.username, true)"), "/@nick/blog lands on the blog and keeps ?ref=");
const feed = read("app/api/social/feed/route.ts");
assert.ok(feed.includes('const guestFeed = scope === "feed" && !user && category !== "following" && !postType;') && feed.includes("!guestFeed"), "guests may read the public feed, not the personal views");
assert.ok(["wishPostIds, publicView ? null : viewerId", "...(publicView ? { snapshot_id: null } : {})", 'publicView ? "" : viewerId'].every((part) => feed.includes(part)), "the guest feed hides what only a signed-in viewer may see");
assert.ok(read("components/PublicFeedPage.tsx").includes("No session is sent on purpose"), "the public feed page never sends a session");
console.log("Public invitation and history links contract verified.");
