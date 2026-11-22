// Contract for the mini path after sign-in (lib/lifeChoices.ts): spheres, depth by sensitivity, Nova's guesses.
import assert from "node:assert/strict";
import { LIFE_SPHERES, LIFE_STATS, LIFE_OBSTACLES, lifeCursor, lifeStats, lifeLook, lifeGuess, lifeWishes, lifeQuestMotives, lifeWeakest, lifeChoicesEnabled } from "../lib/lifeChoices.ts";

assert.equal(LIFE_SPHERES.length, 8);
for (const sphere of LIFE_SPHERES) {
  assert.ok(sphere.entry.length >= 2 && sphere.entry.length <= 4, `${sphere.key}: 2-4 entry cards`);
  assert.ok(sphere.focus.length >= 2 && sphere.focus.length <= 4, `${sphere.key}: 2-4 focus cards`);
  assert.ok(sphere.entry.some((item) => item.interest === 0), `${sphere.key}: has an indifferent answer`);
  assert.ok(sphere.entry.some((item) => item.interest === 2), `${sphere.key}: has a sensitive answer`);
  for (const option of [...sphere.entry, ...sphere.focus]) assert.ok(option.label.ru && option.label.en && option.result.ru && option.result.en && option.icon, `${sphere.key}.${option.key}`);
  for (const focus of sphere.focus) assert.ok(focus.guess.ru && focus.wish.ru && focus.wish.en, `${sphere.key}.${focus.key} guess`);
}
assert.ok(LIFE_OBSTACLES.some((item) => item.key === "less"));

// Indifferent everywhere: one card per sphere, then done.
const calm = {};
for (const sphere of LIFE_SPHERES) {
  assert.deepEqual(lifeCursor(calm), { sphere: LIFE_SPHERES.indexOf(sphere), level: "entry" });
  calm[sphere.key] = { entry: sphere.entry.find((item) => item.interest === 0).key };
}
assert.equal(lifeCursor(calm), null);
assert.deepEqual(lifeWishes(calm, "ru"), []);

// Sensitive health goes deeper: focus -> guess -> (not quite) -> why.
const a = { health: { entry: "tired" } };
assert.deepEqual(lifeCursor(a), { sphere: 0, level: "focus" });
a.health.focus = "sport";
assert.deepEqual(lifeCursor(a), { sphere: 0, level: "guess" });
assert.match(lifeGuess("health", "sport", "ru"), /^Можно ли сказать, что ты хочешь регулярно заниматься спортом.*привычку\?$/);
a.health.verdict = "no";
assert.deepEqual(lifeCursor(a), { sphere: 0, level: "why" });
a.health.obstacle = "time";
assert.deepEqual(lifeCursor(a), { sphere: 1, level: "entry" });

// Wishes: "yes" ranks above "not quite", "not important" drops out.
const w = {
  health: { entry: "tired", focus: "sport", verdict: "no", obstacle: "time" },
  money: { entry: "debt", focus: "debt", verdict: "yes" },
  career: { entry: "ceiling", focus: "raise", verdict: "no", obstacle: "less" }
};
const wishes = lifeWishes(w, "ru");
assert.deepEqual(wishes.map((item) => item.focus), ["debt", "sport"]);
assert.deepEqual(lifeQuestMotives("money"), ["income", "own"]);
assert.deepEqual(lifeQuestMotives("learning"), ["learn", "own"]);
assert.deepEqual(lifeQuestMotives("health"), ["change", "own"]);

// The character reacts.
const bad = { health: { entry: "tired", focus: "sleep" }, money: { entry: "debt" }, relations: { entry: "nobody" } };
const s = lifeStats(bad);
for (const stat of LIFE_STATS) assert.ok(s[stat] >= 0 && s[stat] <= 10);
assert.equal(lifeLook(s).debt, true);
assert.ok(lifeLook(lifeStats({ health: { entry: "extra" }, relations: { entry: "nobody" } })).bodyWidth > lifeLook(lifeStats({})).bodyWidth);
assert.equal(lifeWeakest(s), "money");

const store = new Map();
const read = (key) => store.get(key) ?? null;
const write = (key, value) => store.set(key, value);
assert.equal(lifeChoicesEnabled("", read, write), false);
assert.equal(lifeChoicesEnabled("?story=1", read, write), true);
assert.equal(lifeChoicesEnabled("", read, write), true);
assert.equal(lifeChoicesEnabled("?story=0", read, write), false);
console.log("life choices contract ok");

// The first quest is open at level 0 (a new account has Core $1, level 0); other quests keep the level rule.
const { getChallengeAccessReasons } = await import("../lib/challengeEligibility.ts");
assert.deepEqual(getChallengeAccessReasons({ difficulty_level: 1, verification_logic: "first_step_motive" }, 0), []);
assert.deepEqual(getChallengeAccessReasons({ difficulty_level: 1, verification_logic: "has_wish" }, 0), ["core_level"]);
console.log("first quest level contract ok");
