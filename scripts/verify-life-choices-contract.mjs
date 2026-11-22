// Contract for the mini path after sign-in (lib/lifeChoices.ts).
import assert from "node:assert/strict";
import { LIFE_SCENES, LIFE_STATS, lifeStats, lifeLook, lifeSummary, lifeQuestMotives, lifeChoicesEnabled } from "../lib/lifeChoices.ts";

for (const scene of LIFE_SCENES) {
  assert.ok(scene.options.length >= 2 && scene.options.length <= 4, `${scene.key}: 2-4 cards`);
  for (const option of scene.options) assert.ok(option.label.ru && option.label.en && option.result.ru && option.result.en, `${scene.key}.${option.key}`);
}
assert.deepEqual(Object.keys(lifeStats({})).sort(), [...LIFE_STATS].sort());

const good = { food: "balance", habits: "none", sport: "gym", phone: "sleep", learn: "daily", people: "circle", money: "invest", work: "business" };
const bad = { food: "tasty", habits: "smoke", sport: "sofa", phone: "scroll", learn: "done", people: "alone", money: "credit", work: "hire" };
const g = lifeStats(good);
const b = lifeStats(bad);
for (const stat of LIFE_STATS) assert.ok(g[stat] >= 0 && g[stat] <= 10 && b[stat] >= 0 && b[stat] <= 10, `${stat} in 0..10`);
assert.ok(lifeLook(b).bodyWidth > lifeLook(g).bodyWidth, "unhealthy choices make the body wider");
assert.equal(lifeLook(g).healthy, true);
assert.equal(lifeLook(b).healthy, false);
assert.equal(lifeLook(b).debt, true);
assert.equal(lifeLook(g).friends, 2);
assert.equal(lifeSummary(bad, "ru").weakest, "health");
assert.match(lifeSummary(good, "ru").wish, /клиент/);
assert.deepEqual(lifeQuestMotives(good), ["path", "learn"]);
assert.deepEqual(lifeQuestMotives(bad), ["income", "wish"]);

const store = new Map();
const read = (key) => store.get(key) ?? null;
const write = (key, value) => store.set(key, value);
assert.equal(lifeChoicesEnabled("", read, write), false);
assert.equal(lifeChoicesEnabled("?story=1", read, write), true);
assert.equal(lifeChoicesEnabled("", read, write), true);
assert.equal(lifeChoicesEnabled("?story=0", read, write), false);
console.log("life choices contract ok");
