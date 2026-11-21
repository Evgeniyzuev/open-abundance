// Contract for the story entry «Один свободный день» (lib/firstStory.ts, docs/FIRST_STORY_SCRIPT.md).
import assert from "node:assert/strict";
import { STORY_SCENES, nextSceneKey, resolveStory, storySceneCount, storyEntryEnabled, questMotiveFor } from "../lib/firstStory.ts";

const play = (choices) => {
  const state = { answers: [] };
  for (const choice of choices) {
    const scene = nextSceneKey(state);
    assert.ok(scene, "story ended early");
    assert.ok(STORY_SCENES[scene].choices.some((item) => item.key === choice), `${choice} not in ${scene}`);
    state.answers.push({ scene, choice });
  }
  assert.equal(nextSceneKey(state), null, "story should be over");
  assert.equal(state.answers.length, storySceneCount());
  return state;
};

// Practical start goes to "two offers", social start to "friend with an idea".
const free = play(["rest", "save", "freedom", "closer", "start", "income", "solo"]);
assert.equal(free.answers[2].scene, "offers");
const r1 = resolveStory(free, "ru");
assert.equal(r1.motive, "time"); // money 3, time 3: the later tag wins
assert.equal(r1.obstacle, "fear");
assert.match(r1.sentence, /страх начать/);
assert.equal(r1.alternatives.length, 3);
assert.ok(!r1.alternatives.includes(r1.wish));
assert.equal(questMotiveFor(r1.motive), "income");

const social = play(["friends", "experience", "in", "close", "alone", "people", "together"]);
assert.equal(social.answers[2].scene, "friend");
const r2 = resolveStory(social, "en");
assert.equal(r2.motive, "people");
assert.equal(r2.obstacle, "alone");
assert.equal(r2.style, "together");
assert.ok(r2.world.some((item) => item.icon === "🧭"));
assert.equal(questMotiveFor("meaning"), "change");

// Every scene: 2-4 choices with tags, both languages.
for (const scene of Object.values(STORY_SCENES)) {
  assert.ok(scene.choices.length >= 2 && scene.choices.length <= 5, scene.key);
  for (const choice of scene.choices) assert.ok(choice.text.ru && choice.text.en && choice.tags.length, `${scene.key}.${choice.key}`);
}

// Flag: ?story=1 turns on and is remembered, ?story=0 turns off.
const store = new Map();
const read = (key) => store.get(key) ?? null;
const write = (key, value) => store.set(key, value);
assert.equal(storyEntryEnabled("", read, write), false);
assert.equal(storyEntryEnabled("?story=1", read, write), true);
assert.equal(storyEntryEnabled("", read, write), true);
assert.equal(storyEntryEnabled("?story=0", read, write), false);
console.log("first story contract ok");
