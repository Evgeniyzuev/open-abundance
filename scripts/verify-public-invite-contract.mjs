import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The invitation link leads to the inviter's public page and carries the code; a nickname link keeps the query.
const me = read("app/api/referrals/me/route.ts");
assert.ok(me.includes("`/@${inviter.username}`") && me.includes("`/u/${user.id}`") && me.includes('url.searchParams.set("ref", code)'), "the referral link is the inviter's public page with ?ref=");
assert.ok(read("app/u/by-username/[username]/route.ts").includes("${request.nextUrl.search}"), "/@nickname?ref=... keeps its query when redirecting");

// Public pages work without a session: the pages do not require sign-in and the provider stores the code from ?ref= on any path.
assert.ok(!/redirect\(/.test(read("app/u/[userId]/page.tsx")) && !/redirect\([^)]*auth/.test(read("app/u/[userId]/blog/page.tsx")), "profile and blog pages do not send guests to sign in");
const provider = read("components/UserProvider.tsx");
assert.ok(provider.includes('params.get("ref")') && provider.includes("capturePendingReferral("), "the code is remembered on the device from any page");

// The guest sees an invitation to join; it says the invitation is saved when a code is stored.
const page = read("components/PublicUserPage.tsx");
assert.ok(page.includes("public-join-banner") && page.includes("readLocalGuest") && page.includes("!user"), "guests see the join banner");
for (const key of ["public.join.title", "public.join.text", "public.join.invited", "public.join.cta"]) assert.ok(read("lib/messages/en.ts").includes(`"${key}"`) && read("lib/messages/ru.ts").includes(`"${key}"`), `${key} exists in both languages`);

// Wallet history: the counterparty is a name that opens the public profile, with the short id only as a fallback.
const history = read("components/wallet/HistoryCounterparty.tsx");
assert.ok(history.includes("href={`/u/${row.counterpartyUserId}`}") && history.includes("row.counterpartyName || shortId("), "the counterparty is a profile link");
assert.ok(read("app/api/wallet/history/route.ts").includes("counterpartyName") && read("app/api/wallet/history/route.ts").includes('.from("user_profiles").select("user_id,display_name,username")'), "the history API resolves names");
assert.ok(!read("components/WalletApp.tsx").includes("shortId(row.counterpartyUserId)"), "the screen no longer prints the raw id");
console.log("Public invitation and history links contract verified.");
