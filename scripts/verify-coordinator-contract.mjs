import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFunnel,
  buildMatchProposals,
  buildProposals,
  equityGuard,
  findBottleneck,
  gini,
  growthComposition,
  summarizeDistribution,
  summarizeSatisfaction
} from "../lib/coordinatorAnalysis.ts";

// Run with: node --experimental-strip-types scripts/verify-coordinator-contract.mjs

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const NOW = Date.parse("2026-10-20T12:00:00Z");
const DAY = 86_400_000;

function person(overrides = {}) {
  return {
    id: overrides.id ?? Math.random().toString(16).slice(2),
    registeredAt: new Date(NOW - 5 * DAY).toISOString(),
    coreBalance: 10,
    coreGrowth: { challengeRewards: 0, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 },
    storiesViewed: 0,
    wishes: 0,
    calculatorUsed: false,
    challengesAccepted: 0,
    challengesCompleted: 0,
    feedbackSubmitted: 0,
    novaMessages: 0,
    returnedDay2: false,
    contentPosts: 0,
    externalShares: 0,
    referralsInvited: 0,
    helpProfile: null,
    outcomeAnswers: [],
    checkinAnswer: null,
    ...overrides
  };
}

// --- Inequality maths ---
assert.equal(gini([1, 1, 1, 1]), 0, "equal values have zero Gini");
assert.ok(Math.abs(gini([0, 0, 0, 10]) - 0.75) < 1e-9, "one holder of everything among four is 0.75");
assert.equal(gini([0, 0]), null, "no Core gives no Gini");

const dist = summarizeDistribution([1, 2, 3, 4, 100]);
assert.equal(dist.participants, 5);
assert.equal(dist.median, 3);
assert.ok(dist.top10Share > 0.9, "the top holder dominates this sample");
assert.equal(summarizeDistribution([]).gini, null);

// --- Growth composition: reinvest is excluded from "new" Core ---
const composition = growthComposition([
  { challengeRewards: 30, leaderBonus: 0, reinvest: 500, walletTopups: 10, otherSystem: 0 },
  { challengeRewards: 0, leaderBonus: 10, reinvest: 0, walletTopups: 0, otherSystem: 10 }
]);
assert.equal(composition.newCoreTotal, 60);
assert.ok(Math.abs(composition.earnedShare - 40 / 60) < 1e-9);
assert.ok(Math.abs(composition.topUpShare - 10 / 60) < 1e-9);
assert.equal(composition.reinvestTotal, 500);

// --- Equity guard ---
assert.equal(equityGuard([person(), person()]).verdict, "insufficient_data");

const earnedEvenly = Array.from({ length: 6 }, () => person({ coreBalance: 20, coreGrowth: { challengeRewards: 10, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 } }));
assert.equal(equityGuard(earnedEvenly).verdict, "ok");

const moneyDriven = Array.from({ length: 6 }, (_, index) => person({
  coreBalance: index === 0 ? 1000 : 10,
  coreGrowth: { challengeRewards: 5, leaderBonus: 0, reinvest: 0, walletTopups: index === 0 ? 990 : 0, otherSystem: 0 }
}));
const moneyGuard = equityGuard(moneyDriven);
assert.equal(moneyGuard.verdict, "alert", "growth that is mostly top-ups must raise an alert");
assert.ok(moneyGuard.reasons.length > 0);

const fewEarners = [
  ...Array.from({ length: 2 }, () => person({ coreBalance: 20, coreGrowth: { challengeRewards: 10, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 } })),
  ...Array.from({ length: 4 }, () => person({ coreBalance: 20 }))
];
assert.equal(equityGuard(fewEarners).verdict, "watch", "fewer than half earning from results is a watch");

// --- Satisfaction is reported as components; not_relevant never counts against the product ---
const satisfaction = summarizeSatisfaction([
  person({ outcomeAnswers: ["helped", "not_yet", "not_relevant"], checkinAnswer: "useful_step" }),
  person({ outcomeAnswers: ["not_relevant"], checkinAnswer: "not_yet" }),
  person()
]);
assert.deepEqual(satisfaction.wishOutcome, { answered: 2, positive: 1, rate: 0.5 });
assert.deepEqual(satisfaction.checkin, { answered: 2, positive: 1, rate: 0.5 });
assert.equal(satisfaction.respondents, 2);
assert.equal(satisfaction.participants, 3);

// --- Funnel excludes people who are too new for the return question ---
const funnel = buildFunnel([person({ returnedDay2: true }), person({ returnedDay2: null }), person({ returnedDay2: false })]);
const returned = funnel.find((stage) => stage.key === "returnedDay2");
assert.equal(returned.eligible, 2);
assert.equal(returned.users, 1);

// --- Bottleneck: the weakest core-path step with enough people ---
const crowd = [
  ...Array.from({ length: 4 }, () => person({ storiesViewed: 5, wishes: 1, challengesCompleted: 1, returnedDay2: false })),
  ...Array.from({ length: 2 }, () => person({ storiesViewed: 5, wishes: 0 }))
];
const bottleneck = findBottleneck(crowd);
assert.equal(bottleneck.from, "completedChallenge");
assert.equal(bottleneck.to, "returnedDay2");
assert.equal(bottleneck.conversion, 0);
assert.equal(findBottleneck([person(), person()]), null, "two people are not enough to call a bottleneck");

// --- Proposals: idempotent keys, no contact, never target outside the group ---
const proposals = buildProposals(crowd, "2026-10-20", NOW);
assert.ok(proposals.some((proposal) => proposal.dedupeKey === "bottleneck:completedChallenge>returnedDay2:2026-10-20"));
assert.deepEqual(new Set(proposals.map((proposal) => proposal.dedupeKey)).size, proposals.length, "dedupe keys are unique");
for (const proposal of proposals) assert.ok(proposal.targetUserIds.every((id) => crowd.some((p) => p.id === id)));

// --- Matching: consent required, each person once, those with fewer results first ---
const noConsent = person({ id: "a", helpProfile: { offers: [], needs: ["skill_teacher"], consent: false } });
const teacher = person({ id: "b", helpProfile: { offers: ["tutoring"], needs: [], consent: true } });
assert.equal(buildMatchProposals([noConsent, teacher], "d").length, 0, "no consent, no match");

const strugglingSeeker = person({ id: "c", challengesCompleted: 0, helpProfile: { offers: [], needs: ["skill_teacher"], consent: true } });
const thrivingSeeker = person({ id: "d", challengesCompleted: 5, helpProfile: { offers: [], needs: ["skill_teacher"], consent: true } });
const matches = buildMatchProposals([thrivingSeeker, strugglingSeeker, teacher], "d");
assert.equal(matches.length, 1, "one helper can serve only one match per run");
assert.deepEqual(matches[0].payload.seeker, "c", "the person with fewer results is served first");

const peerA = person({ id: "e", helpProfile: { offers: [], needs: ["accountability"], consent: true } });
const peerB = person({ id: "f", helpProfile: { offers: [], needs: ["accountability"], consent: true } });
assert.equal(buildMatchProposals([peerA, peerB], "d").length, 1);

// --- Contract checks on the wiring ---
const migration = read("supabase/migrations/20261009140000_coordinator_foundation.sql");
for (const table of ["user_help_profiles", "coordinator_recommendations"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
}
assert.match(migration, /coordinator_recommendations_dedupe_idx/);

for (const route of ["app/api/internal/coordinator/digest/route.ts", "app/api/internal/coordinator/recommendations/route.ts"]) {
  const source = read(route);
  assert.match(source, /isGrowthOperator/, route + " must be operator-only");
  assert.match(source, /NO_STORE_HEADERS/);
  assert.match(source, /force-dynamic/);
}

const loader = read("lib/coordinatorData.ts");
assert.doesNotMatch(loader, /select\("[^"]*\b(body|message|description)\b/, "the loader must not read free text");
assert.doesNotMatch(loader, /user_feedback/, "feedback text must not reach the coordinator data");

const helpRoute = read("app/api/help-profile/route.ts");
assert.match(helpRoute, /cleanTags/);
assert.match(helpRoute, /match_consent/);
assert.doesNotMatch(helpRoute, /properties:\s*\{[^}]*offers,/, "tag values must not go into events");

const outcome = read("components/WishOutcomeCheck.tsx");
const outcomeEvent = outcome.match(/trackClientEvent\("wish_outcome_answered",[^)]*\)/)?.[0] ?? "";
assert.ok(outcomeEvent.includes("wish_id"), "the outcome event carries the wish id");
assert.doesNotMatch(outcomeEvent, /title/, "the wish text must not be sent in an event");

assert.match(read("components/FeedPostGallery.tsx"), /hasBeenSeen/, "story impressions must be deduplicated across loads");

console.log("coordinator contract ok");
