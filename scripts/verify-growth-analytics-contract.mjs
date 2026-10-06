import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
for (const relativePath of [
  "app/api/internal/growth/report/route.ts",
  "app/api/social/feed/posts/[postId]/interactions/route.ts",
  "app/globals.css",
  "components/AppNavigation.tsx",
  "components/FeedPostGallery.tsx",
  "components/GrowthMapApp.tsx",
  "components/SelfServeCheckIn.tsx",
  "components/WalletApp.tsx",
  "docs/MASTER_KANBAN.md",
  "docs/SELF_SERVE_PRODUCT_EXPERIMENT.md",
  "lib/i18n.ts",
  "lib/productAnalytics.ts"
]) {
  utf8Decoder.decode(readFileSync(join(root, relativePath)));
}
const reportRoute = read("app/api/internal/growth/report/route.ts");
const claimRoute = read("app/api/auth/claim/route.ts");
const clientAnalytics = read("components/GrowthAnalytics.tsx");
const feedGallery = read("components/FeedPostGallery.tsx");
const checkIn = read("components/SelfServeCheckIn.tsx");
const home = read("app/page.tsx");

assert.equal(existsSync(join(root, "supabase/migrations/20260805100000_growth_analytics_foundation.sql")), false);
assert.equal(existsSync(join(root, "app/api/internal/growth/humanity/route.ts")), false);
assert.doesNotMatch(reportRoute, /humanity_confirmations|humanityConfirmedAccounts|registrationToHumanityRate/);

for (const source of [
  "product_events",
  "referral_edges",
  "wallet_ledger",
  "core_accounts",
  "wallet_accounts",
  "challenge_completion_snapshots",
  "challenge_feedback_submissions"
]) {
  assert.match(reportRoute, new RegExp("from\\(\\\"" + source + "\\\"\\)"), "Missing existing source: " + source);
}

for (const metric of [
  "registrationToFirstActionRate",
  "activeUsersByDay",
  "retentionByCohort",
  "journeyEvents",
  "day2CheckIn",
  "registrationToReferralRate",
  "walletDeposits",
  "coreTopups"
]) {
  assert.match(reportRoute, new RegExp(metric), "Missing MVP metric: " + metric);
}

for (const eventName of [
  "registration_completed",
  "app_open",
  "feed_post_impression",
  "feed_post_opened",
  "feed_interest",
  "feed_want_this",
  "feed_post_commented",
  "growth_map_opened",
  "core_calculator_opened",
  "self_serve_checkin_answered",
  "self_serve_checkin_skipped"
]) {
  assert.match(
    [reportRoute, claimRoute, clientAnalytics].join("\n"),
    new RegExp(eventName),
    eventName + " is missing"
  );
}

assert.match(reportRoute, /isGrowthOperator/);
assert.match(reportRoute, /force-no-store/);
assert.match(reportRoute, /crypto_deposit/);
assert.match(reportRoute, /wallet_core_topup/);
assert.match(claimRoute, /update\(\{ user_id: user\.id \}\)/);
assert.match(home, /<GrowthAnalytics \/>/);
assert.match(feedGallery, /intersectionRatio >= 0\.5/);
assert.match(feedGallery, /feed_post_impression/);
assert.match(checkIn, /CHECK_IN_START_HOURS = 24/);
assert.match(checkIn, /CHECK_IN_WINDOW_HOURS = 24 \* 7/);
assert.match(checkIn, /self_serve_checkin_answered/);
assert.match(checkIn, /self_serve_checkin_skipped/);
assert.doesNotMatch(checkIn, /<textarea/);
const activationEventBlock = reportRoute.match(/const ACTIVATION_EVENTS = \[([\s\S]*?)\] as const/);
assert.ok(activationEventBlock, "Missing explicit activation event list");
assert.doesNotMatch(activationEventBlock[1], /feed_post_|growth_map_opened|core_calculator_|self_serve_checkin_/);
assert.match(reportRoute, /uniqueUserPropertyBreakdown\(events, "self_serve_checkin_answered"/);

console.log("Growth analytics and self-serve check-in contract checks passed.");
