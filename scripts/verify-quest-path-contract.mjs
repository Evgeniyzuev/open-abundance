import assert from "node:assert/strict";
import { calculateFutureCore } from "../lib/coreCalculator.ts";
import { readFileSync } from "node:fs";
import { buildQuestPath, completedQuestCount, isQuestMotive, parseMotives, requiredDailyAddition } from "../lib/questPath.ts";
import { chooseQuestNudge, isHoldout, QUEST_NUDGE_WEEK_LIMIT } from "../lib/questNudges.ts";
import { weeklyLeaders } from "../lib/questLeaders.ts";
import { buildPathReport } from "../lib/questPathAnalytics.ts";
import { chooseNudge } from "../lib/coordinatorNextStep.ts";


const quest = (id, extra = {}) => ({ id, category: "focus", sort_order: 100, difficulty_level: 1, can_accept: true, unlock_at_completed: 0, path_order: null, ...extra });
const path = (n, extra = {}) => quest(`p${n}`, { path_order: n, sort_order: n, category: "start_path", ...extra });

// A newcomer: the first path quest becomes active by itself, nothing else on the path is open yet.
{
  const quests = [path(1), path(2), path(3), ...Array.from({ length: 8 }, (_, i) => quest(`s${i}`, { sort_order: 200 + i })), quest("later", { unlock_at_completed: 1 }), quest("far", { unlock_at_completed: 4 })];
  const view = buildQuestPath(quests, null);
  assert.equal(view.autoActivateId, "p1");
  assert.equal(view.activeId, "p1");
  assert.equal(view.placements.p2, "hidden");
  assert.equal(Object.values(view.placements).filter((p) => p === "available").length, 5, "five side quests when no next path quest is shown");
  assert.equal(view.placements.s7, "more", "the rest waits in More");
  assert.equal(view.placements.later, "almost");
  assert.equal(view.questsMissing.later, 1);
  assert.equal(view.placements.far, "hidden");
}

// The active path quest is accepted: the next one is open, so the person can move on without finishing it.
{
  const view = buildQuestPath([path(1, { user_challenge_status: "accepted", user_challenge_active: true }), path(2), path(3)], null);
  assert.equal(view.autoActivateId, null);
  assert.equal(view.activeId, "p1");
  assert.equal(view.activePathStep, 1);
  assert.equal(view.placements.p2, "path_next");
  assert.equal(view.placements.p3, "hidden");
}

// A skipped path quest does not block the path: the next one becomes active, the skipped one can be taken again.
{
  const view = buildQuestPath([path(1, { user_challenge_status: "declined", user_challenge_active: true }), path(2), path(3)], null);
  assert.equal(view.autoActivateId, "p2");
  assert.equal(view.placements.p1, "more");
}

// Any accepted quest can be made active; the path quest stays accepted and checkable.
{
  const quests = [path(1, { user_challenge_status: "completed" }), path(2, { user_challenge_status: "accepted" }), path(3), quest("side", { user_challenge_status: "accepted", user_challenge_active: true })];
  const view = buildQuestPath(quests, null);
  assert.equal(view.activeId, "side");
  assert.equal(view.activePathStep, null);
  assert.equal(view.placements.p2, "accepted");
  assert.equal(view.placements.p3, "path_next");
  assert.equal(view.pathDone, 1);
}

// Completed quests open side quests; onboarding does not count.
assert.equal(completedQuestCount([quest("a", { user_challenge_status: "completed" }), quest("b", { user_challenge_status: "completed", category: "onboarding" })]), 1);

// The answer to "why are you here" brings matching side quests forward.
{
  const quests = [path(1, { user_challenge_status: "accepted", user_challenge_active: true }), quest("focus1", { sort_order: 1 }), quest("market", { category: "marketplace", sort_order: 900 })];
  const view = buildQuestPath(quests, "income");
  assert.equal(view.placements.market, "available");
  assert.ok(isQuestMotive("own") && !isQuestMotive("money"));
}

// Several answers: known ones only, each once; side quests matching more answers come first.
{
  assert.deepEqual(parseMotives(["wish", "money", "wish", "learn"]), ["wish", "learn"]);
  assert.deepEqual(parseMotives("income"), ["income"]);
  const quests = [path(1, { user_challenge_status: "accepted", user_challenge_active: true }), quest("both", { category: "growth", sort_order: 900 }), ...Array.from({ length: 6 }, (_, i) => quest(`f${i}`, { sort_order: i }))];
  const view = buildQuestPath(quests, ["income", "wish"]);
  assert.equal(view.placements.both, "available", "a quest fitting both answers is not pushed out by the sort order");
}

// Guests see the first path quest but nothing is written for them.
{
  const view = buildQuestPath([path(1), path(2)], null, { signedIn: false });
  assert.equal(view.autoActivateId, null);
  assert.equal(view.activeId, "p1");
}

// The plan in the calculator quest: the daily addition reaches the target by the term.
{
  const daily = requiredDailyAddition(0, 1000, Math.round(3 * 365.25));
  const days = Math.round(3 * 365.25);
  assert.ok(calculateFutureCore({ startCore: 0, dailyAdditions: daily, reinvestPercent: 100, days }) >= 1000, "the plan reaches the price");
  assert.ok(calculateFutureCore({ startCore: 0, dailyAdditions: daily - 0.02, reinvestPercent: 100, days }) < 1000, "and is not padded");
  assert.equal(requiredDailyAddition(2000, 1000, 365), 0, "already reached");
}

const migration = readFileSync(new URL("../supabase/migrations/20261025130000_quest_path.sql", import.meta.url), "utf8");
assert.match(migration, /user_challenges_one_active_idx/);
assert.match(migration, /'first_step_motive'/);
const stage2 = readFileSync(new URL("../supabase/migrations/20261025150000_quest_path_stage2.sql", import.meta.url), "utf8");
assert.match(stage2, /verification_logic = 'app_installed'/, "step 3 is the install quest");
assert.match(stage2, /set path_order = 4 where id = 'f3a71c20-5d4e-4b8a-9c11-2e6d7b8a0c01'/, "step 4 is the Telegram bot");
assert.match(stage2, /quest_motives text\[\]/);
const check = readFileSync(new URL("../app/api/challenges/check/route.ts", import.meta.url), "utf8");
assert.ok(check.includes("APP_INSTALLED_LOGIC") && check.includes("FIRST_STEP_LOGIC"));
const channelRoute = readFileSync(new URL("../app/api/challenges/channel-code/route.ts", import.meta.url), "utf8");
assert.ok(channelRoute.includes('code: "not_installed"'), "the install code is given only to the installed app");
const accept = readFileSync(new URL("../app/api/challenges/accept/route.ts", import.meta.url), "utf8");
assert.ok(accept.includes("quest_locked"), "accept refuses a quest that is not open yet");

// --- Nova's messages about the path ---
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-25T12:00:00Z");
const catalog = [
  { id: "p1", title: { en: "First step", ru: "Первый шаг" }, pathOrder: 1, unlockAtCompleted: 0, category: "start_path", sortOrder: 1 },
  { id: "p2", title: { en: "Main wish", ru: "Главное желание" }, pathOrder: 2, unlockAtCompleted: 0, category: "start_path", sortOrder: 2 },
  { id: "side1", title: { en: "Values", ru: "Ценности" }, pathOrder: null, unlockAtCompleted: 1, category: "focus", sortOrder: 50 }
];
const input = (rows, extra = {}) => ({ catalog, rows, leaderRank: null, weekQuests: 0, ...extra });
const row = (challengeId, status, daysAgo, isActive = false) => ({ challengeId, status, isActive, updatedAt: NOW - daysAgo * DAY });
{
  const first = chooseQuestNudge(input([row("p1", "accepted", 1, true)]), [], NOW - 3600_000, NOW);
  assert.equal(first.key, "quest_first_step");
  assert.match(first.copy.ru.body, /зачем ты здесь/);
  assert.equal(chooseQuestNudge(input([row("p1", "accepted", 1, true)]), [{ step: "quest_first_step", at: NOW - DAY }], null, NOW), null, "asked yesterday: wait three days");

  const unlocked = chooseQuestNudge(input([row("p1", "completed", 1), row("p2", "accepted", 1, true)]), [], NOW - 3600_000, NOW);
  assert.equal(unlocked.key, "quest_unlocked");
  assert.match(unlocked.copy.ru.body, /«Ценности»/);

  const stalled = chooseQuestNudge(input([row("p1", "completed", 5), row("p2", "accepted", 3, true), row("side1", "declined", 4)]), [], NOW - 3600_000, NOW);
  assert.equal(stalled.key, "quest_stalled");
  assert.match(stalled.copy.en.title, /Main wish/);

  const comeback = chooseQuestNudge(input([row("p1", "completed", 10), row("p2", "accepted", 10, true), row("side1", "declined", 10)]), [], NOW - 8 * DAY, NOW);
  assert.equal(comeback.key, "quest_comeback");

  const leader = chooseQuestNudge(input([row("p1", "completed", 1), row("p2", "accepted", 0, true)], { leaderRank: 2, weekQuests: 4 }), [], NOW, NOW);
  assert.equal(leader.key, "quest_leader");
  assert.match(leader.copy.ru.body, /Квестов за 7 дней: 4/);

  const weekFull = Array.from({ length: QUEST_NUDGE_WEEK_LIMIT }, (_, i) => ({ step: "core", at: NOW - (i + 1) * DAY }));
  assert.equal(chooseQuestNudge(input([row("p1", "accepted", 1, true)]), weekFull, null, NOW), null, "three a week at most");
}
// The coordinator lets the path decide and keeps the shared limits.
{
  const participant = { id: "00000000-0000-4000-8000-000000000001", registeredAt: new Date(NOW - 5 * DAY).toISOString(), coreBalance: 0, wishes: 0, calculatorUsed: false, challengesAccepted: 1, challengesCompleted: 0, referralsInvited: 0 };
  const step = chooseNudge(participant, { sends: [] }, { tasks: null, lastActiveAt: NOW - DAY, quest: input([row("p1", "accepted", 2, true)]) }, NOW);
  assert.equal(step.key, "quest_first_step");
  assert.equal(chooseNudge(participant, { sends: [{ step: "core", at: NOW - 3600_000 }] }, { tasks: null, lastActiveAt: null, quest: input([]) }, NOW), null, "one a day");
  const basic = chooseNudge(participant, { sends: [] }, { tasks: null, lastActiveAt: null }, NOW);
  assert.equal(basic.key, "wish", "without quest mode the basic steps stay");
}
// About one in ten is in the control group, always the same people.
{
  const ids = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const share = ids.filter(isHoldout).length / ids.length;
  assert.ok(share > 0.06 && share < 0.14, `holdout share ${share}`);
  assert.equal(isHoldout(ids[7]), isHoldout(ids[7]));
}
// Leaders of the week: completed quests in 7 days, onboarding excluded, ties to whoever got there first.
{
  const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
  const rows = [
    { user_id: "a", challenge_id: "q1", status: "completed", updated_at: iso(0.5) },
    { user_id: "a", challenge_id: "q2", status: "completed", updated_at: iso(2) },
    { user_id: "b", challenge_id: "q1", status: "completed", updated_at: iso(1) },
    { user_id: "b", challenge_id: "q2", status: "completed", updated_at: iso(3) },
    { user_id: "b", challenge_id: "onb", status: "completed", updated_at: iso(1) },
    { user_id: "c", challenge_id: "q1", status: "completed", updated_at: iso(9) },
    { user_id: "c", challenge_id: "q2", status: "completed", updated_at: iso(1) }
  ];
  const leaders = weeklyLeaders(rows, new Set(["onb"]), NOW);
  assert.deepEqual(leaders.map((leader) => leader.userId), ["b", "a"], "b reached 2 first; c has one quest this week");
}
// The "Path" analytics: steps, stuck people, proposals.
{
  const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
  const tables = {
    challenges: [{ id: "p1", title: { ru: "Первый шаг" }, path_order: 1, is_active: true }, { id: "p2", title: { ru: "Желание" }, path_order: 2, is_active: true }],
    user_challenges: [
      ...Array.from({ length: 6 }, (_, i) => ({ user_id: `u${i}`, challenge_id: "p1", status: "completed", created_at: iso(5), updated_at: iso(5) })),
      ...Array.from({ length: 6 }, (_, i) => ({ user_id: `u${i}`, challenge_id: "p2", status: i === 0 ? "completed" : "accepted", created_at: iso(5), updated_at: iso(4) }))
    ],
    user_profiles: Array.from({ length: 6 }, (_, i) => ({ user_id: `u${i}`, created_at: iso(6), quest_motives: ["wish"] })),
    product_events: [],
    notification_events: []
  };
  const report = buildPathReport(tables, { now: NOW, minGroup: 5, pseudonym: (id) => `p_${id}` });
  assert.equal(report.steps[1].stuck, 5);
  assert.equal(report.motives[0].motive, "wish");
  assert.ok(report.proposals.some((proposal) => proposal.title.includes("шаг 2")), "the step that loses people is named");
}

console.log("quest path contract ok");
