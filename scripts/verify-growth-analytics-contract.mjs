import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const reportRoute = read("app/api/internal/growth/report/route.ts");
const claimRoute = read("app/api/auth/claim/route.ts");
const clientAnalytics = read("components/GrowthAnalytics.tsx");
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
  "registrationToReferralRate",
  "walletDeposits",
  "coreTopups"
]) {
  assert.match(reportRoute, new RegExp(metric), "Missing MVP metric: " + metric);
}

for (const eventName of [
  "registration_completed",
  "app_open"
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

console.log("Minimal growth analytics contract checks passed.");
