import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  currentComboStreak,
  freshComboStreak,
  isComboCollected,
  isRiddleAnswer,
  recordCombo,
  restoreComboStreak,
  riddleOfDay,
  RIDDLE_COUNT
} from "../lib/dailyCombo.ts";

// One riddle per UTC day, the same for everyone; consecutive days differ and all riddles appear.
const seen = new Set();
let previous = null;
for (let index = 0; index < RIDDLE_COUNT; index += 1) {
  const day = new Date(Date.UTC(2026, 9, 22 + index)).toISOString().slice(0, 10);
  const riddle = riddleOfDay(day);
  assert.ok(riddle >= 1 && riddle <= RIDDLE_COUNT);
  assert.notEqual(riddle, previous);
  previous = riddle;
  seen.add(riddle);
}
assert.equal(seen.size, RIDDLE_COUNT);
assert.equal(riddleOfDay("2026-10-22"), riddleOfDay("2026-10-22"));

// Answers: case, ё, spaces and punctuation do not matter; both languages count.
assert.equal(isRiddleAnswer(1, " Core! "), true);
assert.equal(isRiddleAnswer(3, "Кошелёк"), true);
assert.equal(isRiddleAnswer(6, "Реалити роста"), true);
assert.equal(isRiddleAnswer(2, "Алиса"), false);
assert.equal(isRiddleAnswer(2, ""), false);

// Combo: riddle plus two other actions.
assert.equal(isComboCollected(["riddle", "adventure"]), false);
assert.equal(isComboCollected(["adventure", "question", "stories"]), false);
assert.equal(isComboCollected(["riddle", "adventure", "question"]), true);

// Streak: next day continues, a repeat changes nothing, one gap a week is frozen, longer gaps restart.
let streak = recordCombo(freshComboStreak(), "2026-10-01");
assert.equal(streak.streak, 1);
assert.deepEqual(recordCombo(streak, "2026-10-01"), streak);
streak = recordCombo(streak, "2026-10-02");
assert.equal(streak.streak, 2);
streak = recordCombo(streak, "2026-10-04");
assert.equal(streak.streak, 3, "one missed day is frozen");
assert.equal(streak.freezeDay, "2026-10-03");
streak = recordCombo(streak, "2026-10-06");
assert.equal(streak.streak, 1, "a second gap within a week restarts");
streak = recordCombo(streak, "2026-10-12");
assert.equal(streak.streak, 1);
streak = recordCombo(recordCombo(streak, "2026-10-13"), "2026-10-15");
assert.equal(streak.streak, 3, "the freeze is back after a week");
assert.equal(currentComboStreak(streak, "2026-10-16"), 3);
assert.equal(currentComboStreak(streak, "2026-10-20"), 0);
assert.deepEqual(restoreComboStreak(JSON.parse(JSON.stringify(streak))), streak);
assert.deepEqual(restoreComboStreak("x"), freshComboStreak());

// Riddle texts and hints exist in both languages; answers stay out of analytics.
const i18n = readFileSync("lib/messages/ru.ts", "utf8") + readFileSync("lib/messages/en.ts", "utf8");
for (let index = 1; index <= RIDDLE_COUNT; index += 1) {
  assert.equal(i18n.split(`"riddle.${index}":`).length - 1, 2, `riddle.${index} in RU and EN`);
  assert.equal(i18n.split(`"riddle.${index}.hint":`).length - 1, 2, `riddle.${index}.hint in RU and EN`);
}
const card = readFileSync("components/DailySetCard.tsx", "utf8");
assert.doesNotMatch(card, /trackProductEvent\([^)]*riddleAnswer/, "riddle answers never go to analytics");

console.log("daily combo contract ok");
