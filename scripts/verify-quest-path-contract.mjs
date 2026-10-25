import assert from "node:assert/strict";
import { calculateFutureCore } from "../lib/coreCalculator.ts";
import { readFileSync } from "node:fs";
import { buildQuestPath, completedQuestCount, isQuestMotive, requiredDailyAddition } from "../lib/questPath.ts";


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
assert.match(migration, /'channel_connected'/);
assert.match(migration, /is_active = false where verification_logic in \('code_push', 'code_telegram'\)/, "one channel is paid once");
const check = readFileSync(new URL("../app/api/challenges/check/route.ts", import.meta.url), "utf8");
assert.ok(check.includes("CHANNEL_CONNECTED_LOGIC") && check.includes("FIRST_STEP_LOGIC"));
const accept = readFileSync(new URL("../app/api/challenges/accept/route.ts", import.meta.url), "utf8");
assert.ok(accept.includes("quest_locked"), "accept refuses a quest that is not open yet");

console.log("quest path contract ok");
