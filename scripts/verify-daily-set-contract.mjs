import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activeDailySetCards,
  ADVENTURE_COUNT,
  buildDailySet,
  freshDailySetState,
  isDailySetFinished,
  pickDailyIndex,
  QUESTION_COUNT,
  recordDailySetStep,
  restoreDailySetState
} from "../lib/dailySet.ts";

// The set is short and never shows a card without data.
assert.deepEqual(buildDailySet({ hasTask: true, hasChallenge: true }), ["task", "adventure", "challenge", "question", "stories"]);
assert.deepEqual(buildDailySet({ hasTask: false, hasChallenge: false }), ["adventure", "question", "stories"]);

// Same day, same pick; picks stay inside the catalog.
assert.equal(pickDailyIndex("2026-10-13", ADVENTURE_COUNT), pickDailyIndex("2026-10-13", ADVENTURE_COUNT));
for (let day = 1; day <= 31; day += 1) {
  const key = `2026-10-${String(day).padStart(2, "0")}`;
  const adventure = pickDailyIndex(key, ADVENTURE_COUNT);
  const question = pickDailyIndex(key, QUESTION_COUNT, 7);
  assert.ok(adventure >= 1 && adventure <= ADVENTURE_COUNT);
  assert.ok(question >= 1 && question <= QUESTION_COUNT);
}

// Progress is per day and the card order is locked at the first step.
const day = "2026-10-13";
assert.deepEqual(restoreDailySetState({ day: "2026-10-12", index: 3 }, day), freshDailySetState(day), "yesterday's set never carries over");
const built = buildDailySet({ hasTask: true, hasChallenge: false });
let state = recordDailySetStep(freshDailySetState(day), "task", "action", built);
assert.deepEqual(state.cards, built);
assert.deepEqual(activeDailySetCards(state, buildDailySet({ hasTask: false, hasChallenge: true })), built, "finishing the task does not reshuffle the set");
state = recordDailySetStep(state, "adventure", "skip");
state = recordDailySetStep(state, "question", "action");
state = recordDailySetStep(state, "question", "action");
assert.equal(state.actions, 2, "acting twice on the same kind counts once");
assert.equal(state.skips, 1);
assert.equal(isDailySetFinished(state, state.cards), true, "the set has an end");
assert.deepEqual(restoreDailySetState(JSON.parse(JSON.stringify(state)), day), state, "progress survives a reload");

// Texts exist in both languages.
const i18n = readFileSync("lib/i18n.ts", "utf8");
for (let index = 1; index <= ADVENTURE_COUNT; index += 1) assert.equal(i18n.split(`"adventure.${index}":`).length - 1, 2, `adventure.${index} in RU and EN`);
for (let index = 1; index <= QUESTION_COUNT; index += 1) assert.equal(i18n.split(`"question.${index}":`).length - 1, 2, `question.${index} in RU and EN`);

// No new server load and an honest end.
const card = readFileSync("components/DailySetCard.tsx", "utf8");
assert.doesNotMatch(card, /fetch\(|supabase/i, "the daily set reads only local or already loaded data");
assert.match(card, /dailySet\.summary\.enough/, "the set ends with an explicit summary");
assert.doesNotMatch(card, /properties:\s*\{[^}]*answer/, "answers never go to analytics");
const feedback = readFileSync("lib/ui/feedback.ts", "utf8");
assert.match(feedback, /prefersLessMotion\(\)/, "feedback respects system and in-app motion settings");
assert.match(readFileSync("lib/attention.ts", "utf8"), /prefers-reduced-motion: reduce/);

console.log("Daily set contract verified.");
