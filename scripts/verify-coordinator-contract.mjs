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

// Learning loop (docs/AI_CONSTITUTION.md section 7): strategy per proposal, measured outcome, report.
{
  const loop = readFileSync("supabase/migrations/20261014210000_coordinator_learning_loop.sql", "utf8");
  assert.ok(loop.includes("add column if not exists strategy_key"), "strategy recorded");
  assert.ok(loop.includes("where status in ('approved', 'done')"), "only approved or done are measured");
  assert.ok(loop.includes("e.properties ->> 'answer' = 'helped'"), "uses the one-tap helped answer");
  assert.ok(loop.includes("w.completed_at >= rec.starts"), "only results after the decision count");
  assert.ok(loop.includes("'open-abundance-coordinator-outcomes-daily'"), "measured daily");
  assert.ok(readFileSync("app/api/internal/coordinator/digest/route.ts", "utf8").includes("strategy_key: `rules:${proposal.dedupeKey.split(\":\")[0]}`"));
  assert.ok(readFileSync("app/api/internal/coordinator/report/route.ts", "utf8").includes("isGrowthOperator(user.id)"), "operator only");
}

// Next-step pushes: first unmet basic step, paced, once per step.
{
  const { nextStepFor, planNudges, parseNudgeKey, nudgeIdempotencyKey, NUDGE_COOLDOWN_MS, NUDGE_MAX_PER_PERSON, NEXT_STEPS } = await import("../lib/coordinatorNextStep.ts");
  const fresh = person({ id: "a", registeredAt: new Date(NOW - 3_600_000).toISOString() });
  assert.equal(nextStepFor(fresh, NOW), null, "nobody is nudged in the first day");
  assert.equal(nextStepFor(person({ id: "b" }), NOW).key, "wish");
  assert.equal(nextStepFor(person({ id: "c", wishes: 1 }), NOW).key, "calculator");
  assert.equal(nextStepFor(person({ id: "d", wishes: 1, calculatorUsed: true }), NOW).key, "accept_challenge");
  assert.equal(nextStepFor(person({ id: "e", wishes: 1, calculatorUsed: true, challengesAccepted: 1 }), NOW).key, "finish_challenge");
  assert.equal(nextStepFor(person({ id: "f", wishes: 1, calculatorUsed: true, challengesAccepted: 1, challengesCompleted: 1 }), NOW).key, "invite");
  assert.equal(nextStepFor(person({ id: "g", wishes: 1, calculatorUsed: true, challengesAccepted: 1, challengesCompleted: 1, referralsInvited: 1 }), NOW), null, "nothing left to ask");

  const key = nudgeIdempotencyKey("wish", "0a55a540-1111-2222-3333-444455556666");
  assert.deepEqual(parseNudgeKey(key), { step: "wish", userId: "0a55a540-1111-2222-3333-444455556666" });
  assert.equal(parseNudgeKey("p2p-action:x"), null);

  const people = [person({ id: "p1" }), person({ id: "p2" }), person({ id: "p3" }), person({ id: "p4" })];
  const history = new Map([
    ["p2", { lastAt: NOW - NUDGE_COOLDOWN_MS - 1000, steps: new Set(["wish"]), count: 1 }],
    ["p3", { lastAt: NOW - 1000, steps: new Set(["calculator"]), count: 1 }],
    ["p4", { lastAt: NOW - NUDGE_COOLDOWN_MS - 1000, steps: new Set(["a", "b", "c", "d"]), count: NUDGE_MAX_PER_PERSON }]
  ]);
  const planned = planNudges(people, history, NOW, 10);
  assert.deepEqual(planned.map((item) => item.userId), ["p1"], "repeat step, cooldown and lifetime cap all hold people back");
  assert.equal(planNudges([person({ id: "x1" }), person({ id: "x2" })], new Map(), NOW, 1).length, 1, "per-run limit");

  for (const step of Object.values(NEXT_STEPS)) {
    for (const lang of ["ru", "en"]) {
      assert.ok(step.copy[lang].title.length > 0 && step.copy[lang].title.length <= 160, `${step.key} ${lang} title length`);
      assert.ok(step.copy[lang].body.length > 0 && step.copy[lang].body.length <= 500, `${step.key} ${lang} body length`);
    }
    assert.ok(step.deepLink.startsWith("/?view="), `${step.key} deep link opens a screen`);
  }

  const route = read("app/api/internal/coordinator/nudges/route.ts");
  assert.ok(route.includes("COORDINATOR_NUDGES_ENABLED") && route.includes("dryRun: !enabled"), "sending needs the switch");
  assert.ok(route.includes("TON_SCANNER_SECRET") && route.includes("isGrowthOperator"), "cron secret or operator only");
  const sender = read("lib/coordinatorNudges.ts");
  assert.ok(sender.includes('p_category: "reminders"'), "users can mute through the reminders preference");
  assert.ok(sender.includes("nudgeIdempotencyKey"), "one push per step and person");
  const nudgeSql = read("supabase/migrations/20261018120000_coordinator_nudges_cron.sql");
  assert.ok(nudgeSql.includes("'open-abundance-coordinator-nudges-daily'") && nudgeSql.includes("/api/internal/coordinator/nudges"));

  // Telegram channel: Russian only for ru, a Mini App button on the same deep link, only where there is no web push.
  const { buildTelegramNudge } = await import("../lib/telegramBot.ts");
  const copy = { ru: { title: "Заголовок", body: "Текст" }, en: { title: "Title", body: "Body" } };
  const ruMessage = buildTelegramNudge(copy, "ru", "/?view=goals.desires", "https://example.test/");
  assert.equal(ruMessage?.text, "Заголовок\n\nТекст");
  assert.equal(ruMessage?.url, "https://example.test/?view=goals.desires");
  assert.equal(buildTelegramNudge(copy, "es", "/?view=wallet.core", "https://example.test")?.text, "Title\n\nBody", "other languages read English");
  assert.equal(buildTelegramNudge(copy, "en", "//evil.test", "https://example.test"), null, "deep links stay on the site");
  assert.ok(sender.includes("push_subscriptions") && sender.includes("push_enabled === false"), "Telegram only without web push and when reminders are on");
}

console.log("coordinator contract ok");
