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

  const uid = "0a55a540-1111-2222-3333-444455556666";
  const key = nudgeIdempotencyKey("wish", uid, NOW);
  assert.equal(key, `coach-next-step:wish:${uid}:2026-10-20`, "one key per step, person and day");
  assert.deepEqual(parseNudgeKey(key), { step: "wish", userId: uid });
  assert.deepEqual(parseNudgeKey(`coach-next-step:wish:${uid}`), { step: "wish", userId: uid }, "older keys without a day still count");
  assert.equal(parseNudgeKey("p2p-action:x"), null);

  // Daily message: Core balance first, then basic steps, then tasks for today; one a day; quiet when ignored.
  const { chooseNudge, NUDGE_PAUSE_AFTER, NUDGE_STEP_GAP_MS } = await import("../lib/coordinatorNextStep.ts");
  const H = 3_600_000;
  const tasks = { count: 3, amount: 4, challengeIds: ["x", "y", "z"] };
  const ctx = (overrides = {}) => ({ tasks, lastActiveAt: NOW - H, ...overrides });
  const sent = (...items) => ({ sends: items.map(([step, hoursAgo]) => ({ step, at: NOW - hoursAgo * H })) });
  const rich = person({ id: "r", coreBalance: 3.5 });
  assert.equal(chooseNudge(rich, undefined, ctx(), NOW).key, "core", "the first message is the Core balance");
  assert.equal(chooseNudge(person({ id: "z", coreBalance: 0 }), undefined, ctx(), NOW).key, "wish", "no Core message with an empty Core");
  assert.equal(chooseNudge(rich, sent(["core", 30]), ctx(), NOW).key, "wish", "then the first basic step");
  assert.equal(chooseNudge(rich, sent(["core", 10]), ctx(), NOW), null, "at most one message a day");
  assert.equal(chooseNudge(rich, sent(["core", 60], ["wish", 30]), ctx({ lastActiveAt: null }), NOW).key, "tasks", "never the same step two days in a row");
  assert.equal(chooseNudge(rich, sent(["core", 200], ["wish", 100]), ctx(), NOW).key, "wish", "a step is asked again days later");
  assert.equal(chooseNudge(rich, sent(["core", 300], ["wish", 200], ["tasks", 100], ["wish", 30]), ctx(), NOW).key, "tasks", "a step is asked at most twice");
  assert.equal(chooseNudge(rich, sent(["core", 300], ["wish", 30 + NUDGE_STEP_GAP_MS / H - 40]), ctx(), NOW).key, "tasks", "and not twice within a few days");
  const ignored = sent(...Array.from({ length: NUDGE_PAUSE_AFTER }, (_, i) => ["tasks", 30 + i * 24]));
  assert.equal(chooseNudge(rich, ignored, ctx({ lastActiveAt: NOW - 1000 * H }), NOW), null, "quiet after messages the person did not open the app for");
  assert.equal(chooseNudge(rich, ignored, ctx({ lastActiveAt: NOW - 2 * H }), NOW)?.key, "core", "back to messages once they come back");
  const allDone = person({ id: "d", wishes: 1, calculatorUsed: true, challengesAccepted: 1, challengesCompleted: 1, referralsInvited: 1 });
  assert.equal(chooseNudge(allDone, sent(["core", 30]), ctx(), NOW).key, "tasks");
  assert.equal(chooseNudge(allDone, sent(["core", 30]), ctx({ tasks: { count: 0, amount: 0, challengeIds: [] } }), NOW), null, "nothing to say, no message");

  const people = [person({ id: "p1" }), person({ id: "p2" }), person({ id: "p3" }), person({ id: "p4" })];
  const history = new Map([
    ["p2", sent(["wish", 30], ["calculator", 60])],
    ["p3", sent(["calculator", 2])],
    ["p4", { sends: Array.from({ length: NUDGE_MAX_PER_PERSON }, (_, i) => ({ step: "tasks", at: NOW - (i + 30) * 24 * H })) }]
  ]);
  const planned = planNudges(people, history, NOW, 10, () => ctx({ tasks: null, lastActiveAt: NOW - H }));
  assert.deepEqual(planned.map((item) => [item.userId, item.step.key]), [["p1", "core"], ["p2", "core"]], "cooldown and lifetime cap hold people back");
  assert.ok(NUDGE_COOLDOWN_MS < 24 * H && NUDGE_COOLDOWN_MS >= 18 * H, "about one a day");
  assert.equal(planNudges([person({ id: "x1" }), person({ id: "x2" })], new Map(), NOW, 1).length, 1, "per-run limit");

  // Tasks for today: quick, unfinished, first step of a track, prerequisites met, up to $10 together.
  const { pickTodayTasks, fillNudgeCopy, tasksPhrase, formatUsd } = await import("../lib/coordinatorNextStep.ts");
  const ch = (id, sortOrder, coreReward, extra = {}) => ({ id, sortOrder, coreReward, walletReward: 0, verificationLogic: "has_wish", trackKey: null, trackStep: null, prerequisiteId: null, rewardMode: "guaranteed", competitionClosesAt: null, ...extra });
  const catalog = [
    ch("a", 1, 1), ch("b", 2, 2), ch("t1", 3, 1, { trackKey: "path", trackStep: 1 }), ch("t2", 4, 1, { trackKey: "path", trackStep: 2 }),
    ch("sale", 5, 1, { verificationLogic: "first_sale" }), ch("pre", 6, 1, { prerequisiteId: "zz" }), ch("zero", 7, 0),
    ch("comp", 8, 1, { rewardMode: "top_n" }), ch("big", 9, 4, { walletReward: 1 }), ch("c", 10, 1)
  ];
  assert.deepEqual(pickTodayTasks(catalog, new Set()), { count: 5, amount: 10, challengeIds: ["a", "b", "t1", "big", "c"] });
  assert.deepEqual(pickTodayTasks(catalog, new Set(["a", "t1", "big"])).challengeIds, ["b", "t2", "c"], "the next track step opens after the first");
  assert.equal(pickTodayTasks(catalog, new Set(catalog.map((item) => item.id))).count, 0);

  assert.equal(tasksPhrase("ru", 1), "1 задание");
  assert.equal(tasksPhrase("ru", 3), "3 задания");
  assert.equal(tasksPhrase("ru", 5), "5 заданий");
  assert.equal(tasksPhrase("ru", 12), "12 заданий");
  assert.equal(tasksPhrase("en", 1), "1 task");
  assert.equal(formatUsd(3.456), "$3.46");
  assert.equal(formatUsd(4), "$4");
  const coreCopy = fillNudgeCopy(NEXT_STEPS.core.copy, { name: "Аня", core: 12.5, tasks: null });
  assert.equal(coreCopy.ru.title, "Аня, у тебя $12.50 в Core");
  assert.equal(coreCopy.ru.button, "Открыть квесты");
  assert.equal(coreCopy.en.title, "Аня, you have $12.50 in Core");
  const taskCopy = fillNudgeCopy(NEXT_STEPS.tasks.copy, { name: null, core: 0, tasks: { count: 3, amount: 4, challengeIds: [] } });
  assert.equal(taskCopy.ru.title, "На сегодня для тебя 3 задания", "without a name the sentence starts with a capital");
  assert.equal(taskCopy.ru.body, "Вместе это до +$4. Первое займёт пару минут.");
  assert.equal(taskCopy.ru.button, "Посмотреть задания");
  assert.equal(fillNudgeCopy(NEXT_STEPS.core.copy, { name: null, core: 1, tasks: null }).zh.title, "你的 Core 里有 $1");

  for (const step of Object.values(NEXT_STEPS)) {
    for (const lang of ["ru", "en", "es", "zh", "hi", "ar"]) {
      assert.ok(step.copy[lang].title.length > 0 && step.copy[lang].title.length <= 160, `${step.key} ${lang} title length`);
      assert.ok(step.copy[lang].body.length > 0 && step.copy[lang].body.length <= 500, `${step.key} ${lang} body length`);
      assert.ok(step.copy[lang].button.length > 0 && step.copy[lang].button.length <= 30, `${step.key} ${lang} button`);
    }
    assert.ok(step.deepLink.startsWith("/?view="), `${step.key} deep link opens a screen`);
  }

  const route = read("app/api/internal/coordinator/nudges/route.ts");
  assert.ok(route.includes("COORDINATOR_NUDGES_ENABLED") && route.includes("dryRun: !enabled"), "sending needs the switch");
  assert.ok(route.includes("TON_SCANNER_SECRET") && route.includes("isGrowthOperator"), "cron secret or operator only");
  const sender = read("lib/coordinatorNudges.ts");
  assert.ok(sender.includes('p_category: "reminders"'), "users can mute through the reminders preference");
  assert.ok(sender.includes("nudgeIdempotencyKey(step.key, userId, now)"), "one message per step, person and day");
  assert.ok(sender.includes("fillNudgeCopy") && sender.includes("DAY2_EVENT"), "copy is personal and the day-2 message counts as today's message");
  const nudgeSql = read("supabase/migrations/20261018120000_coordinator_nudges_cron.sql");
  assert.ok(nudgeSql.includes("'open-abundance-coordinator-nudges-daily'") && nudgeSql.includes("/api/internal/coordinator/nudges"));

  // When to send: daytime in the person's time zone, a fallback UTC window without one, and results per step.
  const { isNudgeSendTime, nudgeOutcomes } = await import("../lib/coordinatorNextStep.ts");
  const at = (iso) => Date.parse(iso);
  assert.equal(isNudgeSendTime("Europe/Moscow", at("2026-10-22T09:00:00Z")), true, "12:00 in Moscow is daytime");
  assert.equal(isNudgeSendTime("Asia/Shanghai", at("2026-10-22T15:00:00Z")), false, "23:00 in Shanghai is night");
  assert.equal(isNudgeSendTime("Not/AZone", at("2026-10-22T15:00:00Z")), true, "an unknown zone uses the UTC window");
  assert.equal(isNudgeSendTime(null, at("2026-10-22T15:00:00Z")), true);
  assert.equal(isNudgeSendTime(null, at("2026-10-22T03:00:00Z")), false);
  const outcomePeople = [
    { id: "a", wishes: 1, calculatorUsed: false, challengesAccepted: 0, challengesCompleted: 0, referralsInvited: 0 },
    { id: "b", wishes: 0, calculatorUsed: false, challengesAccepted: 0, challengesCompleted: 0, referralsInvited: 0 }
  ];
  assert.deepEqual(nudgeOutcomes(outcomePeople, [{ userId: "a", step: "wish" }, { userId: "b", step: "wish" }]), { wish: { sent: 2, done: 1, opened: 0 } });
  assert.deepEqual(
    nudgeOutcomes([{ ...outcomePeople[0], lastActiveAt: "2026-10-21T00:00:00Z" }], [{ userId: "a", step: "tasks", at: at("2026-10-20T00:00:00Z") }]),
    { tasks: { sent: 1, done: 0, opened: 1 } },
    "opened the app after the message"
  );
  const nudgesSource = read("lib/coordinatorNudges.ts");
  assert.ok(nudgesSource.includes("isNudgeSendTime") && nudgesSource.includes("loadProfiles"), "the sender respects the person's time zone");
  const tzMigration = read("supabase/migrations/20261022160000_profile_timezone_nudges_hourly.sql");
  assert.ok(tzMigration.includes("add column if not exists timezone") && tzMigration.includes("open-abundance-coordinator-nudges-hourly"));

  const textsMigration = read("supabase/migrations/20261022170000_push_text_languages.sql");
  assert.ok(textsMigration.includes("in ('ru', 'es', 'zh', 'hi', 'ar')") && textsMigration.includes("metadata->'copy'->'en'->>'title'"), "push text language comes from the profile with an English fallback");

  // Telegram channel: bold title, the step's own button, a Mini App button on the same deep link, only without web push.
  const { buildTelegramNudge } = await import("../lib/telegramBot.ts");
  const copy = { ru: { title: "Аня <3", body: "Текст & ещё", button: "Узнать подробнее" }, en: { title: "Title", body: "Body" } };
  const ruMessage = buildTelegramNudge(copy, "ru", "/?view=goals.desires", "https://example.test/");
  assert.equal(ruMessage?.text, "<b>Аня &lt;3</b>\n\nТекст &amp; ещё", "HTML bold title, names and text escaped");
  assert.equal(ruMessage?.html, true);
  assert.equal(ruMessage?.buttonText, "Узнать подробнее");
  assert.equal(ruMessage?.url, "https://example.test/?view=goals.desires");
  assert.equal(buildTelegramNudge(copy, "hi", "/?view=wallet.core", "https://example.test")?.text, "<b>Title</b>\n\nBody", "a language without text reads English");
  const withEs = buildTelegramNudge({ ...copy, es: { title: "Titulo", body: "Cuerpo" } }, "es", "/?view=wallet.core", "https://example.test");
  assert.equal(withEs?.text, "<b>Titulo</b>\n\nCuerpo");
  assert.equal(withEs?.buttonText, "Abrir", "without a step button the generic one");
  assert.ok(read("lib/telegramBot.ts").includes('parse_mode: "HTML"'));
  assert.equal(buildTelegramNudge(copy, "en", "//evil.test", "https://example.test"), null, "deep links stay on the site");
  assert.ok(sender.includes("push_subscriptions") && sender.includes("push_enabled === false"), "Telegram only without web push and when reminders are on");
}

console.log("coordinator contract ok");
