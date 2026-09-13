import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const migration = read("supabase/migrations/20260806120000_acquisition_publication_challenges.sql");
const submitRoute = read("app/api/challenges/acquisition/route.ts");
const reviewRoute = read("app/api/challenges/peer-reviews/route.ts");
const panel = read("components/AcquisitionChallengePanel.tsx");
const peerPanel = read("components/PeerReviewsPanel.tsx");
const challengesApp = read("components/ChallengesApp.tsx");
const acquisition = read("lib/acquisition.ts");
const productAnalytics = read("lib/productAnalytics.ts");
const authCallback = read("app/auth/callback/page.tsx");

for (const target of [1, 3, 6, 12]) assert.match(migration, new RegExp("acquisition_publications.*" + target), "Missing publication target " + target);
for (const reward of ["Core +1", "Core +2", "Core +3"]) assert.match(migration, new RegExp(reward.replace("+", "\\+")), "Missing slower reward " + reward);
for (const metric of ["acquisition_metric_views", "acquisition_metric_reactions", "acquisition_metric_comments"]) assert.match(migration, new RegExp(metric), "Missing quality challenge " + metric);
assert.doesNotMatch(migration, /character count|количество символов/i);
assert.match(migration, /peer_review_tasks/);
assert.match(migration, /peer_review_answers/);
assert.match(migration, /settle_peer_review_answer/);
assert.match(migration, /audit_peer_review_answer/);
assert.match(migration, /is_permanent boolean/);
assert.match(migration, /peer_reviews/);
assert.match(migration, /review_reward_amount/);
assert.doesNotMatch(migration, /peer_points|peer point|acquisition_review_assignments/i);
assert.match(submitRoute, /coverUrl/);
assert.match(submitRoute, /referralCode/);
assert.match(submitRoute, /peer_review_tasks/);
assert.match(reviewRoute, /action === "accept"/);
assert.match(reviewRoute, /action === "decline"/);
assert.match(reviewRoute, /action === "submit"/);
assert.match(reviewRoute, /next_reward_blocked/);
assert.doesNotMatch(reviewRoute, /peer_points|peer point/i);
assert.match(panel, /metricValue/);
assert.match(peerPanel, /peerReviews\.withheld/);
assert.match(challengesApp, /permanentChallenges/);
assert.match(acquisition, /existing\?\.source && existing\.source !== "direct"/);
assert.match(authCallback, /readAcquisitionContext/);
assert.match(authCallback, /anonymousId: guest\.guestId/);
assert.match(authCallback, /referralCode: guest\.pendingReferral\?\.referralCode/);
assert.match(productAnalytics, /getOrCreateLocalGuest/);
assert.match(productAnalytics, /sendProductEvent\(guest\.guestId/);

const acquisitionModule = { exports: {} };
const acquisitionCode = ts.transpileModule(acquisition, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const storedValues = new Map();
const acquisitionWindow = {
  location: { search: "?utm_source=reddit&utm_medium=community&utm_campaign=pilot" },
  localStorage: {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value)
  }
};
vm.runInNewContext(`(function(module,exports){${acquisitionCode}\n})(module,module.exports)`, {
  URLSearchParams,
  module: acquisitionModule,
  window: acquisitionWindow
});
acquisitionModule.exports.captureAcquisitionContext();
assert.deepEqual(JSON.parse(storedValues.get("openAbundanceAcquisitionContext")), {
  source: "reddit",
  medium: "community",
  campaign: "pilot"
});
acquisitionWindow.location.search = "?utm_source=another";
acquisitionModule.exports.captureAcquisitionContext();
assert.equal(JSON.parse(storedValues.get("openAbundanceAcquisitionContext")).source, "reddit", "First non-direct attribution remains stable");
console.log("Acquisition challenges contract checks passed.");
