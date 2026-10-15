import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIM_ARMS, SIM_CLOTHES, SIM_POSES, SIM_SCENE_SLOTS, SIM_SHELF_MAX, SIM_SLOTS,
  effectivePose, readSimOutfit, readSimPose, readSimShelf, sanitizeShelf, storeSimOutfit, storeSimPose, storeSimShelf
} from "../lib/simWardrobe.ts";

assert.equal(new Set(SIM_CLOTHES.map((item) => item.id)).size, SIM_CLOTHES.length, "clothing ids are unique");
for (const slot of SIM_SLOTS) assert.ok(SIM_CLOTHES.some((item) => item.slot === slot), `slot ${slot} has clothes`);
for (const item of SIM_CLOTHES) {
  assert.ok(SIM_SLOTS.includes(item.slot), `${item.id} uses a known slot`);
  assert.ok(item.paths.length > 0 && item.paths.every((d) => /^M[\d\s.,a-zA-Z-]+$/.test(d)), `${item.id} has plain path data`);
  assert.equal(Boolean(item.place), SIM_SCENE_SLOTS.includes(item.slot), `${item.id}: only scene items carry a placement`);
}

// Every label exists in both languages.
const i18n = readFileSync("lib/messages/ru.ts", "utf8") + readFileSync("lib/messages/en.ts", "utf8");
const keys = [
  "sim.title", "sim.pose.title", "sim.shelf", "sim.photo", "sim.walk",
  ...SIM_SLOTS.map((slot) => `sim.slot.${slot}`),
  ...SIM_CLOTHES.map((item) => `sim.item.${item.id}`),
  ...SIM_POSES.map((pose) => `sim.pose.${pose}`)
];
for (const key of keys) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} in RU and EN`);

// The stored state is sanitised.
const store = new Map();
globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };
storeSimOutfit("u1", { top: "tshirt", head: "trousers", feet: "sneakers" });
assert.deepEqual(readSimOutfit("u1"), { top: "tshirt", feet: "sneakers" }, "unknown ids and wrong slots are dropped");
store.set("open-abundance-sim-outfit:u2", "not json");
assert.deepEqual(readSimOutfit("u2"), {});
assert.deepEqual(readSimOutfit(null), {});

assert.equal(readSimPose("u1"), "auto");
storeSimPose("u1", "wave");
assert.equal(readSimPose("u1"), "wave");
store.set("open-abundance-sim-pose:u1", "fly");
assert.equal(readSimPose("u1"), "auto", "an unknown pose falls back to auto");
assert.equal(effectivePose("auto", "celebrate"), "cheer");
assert.equal(effectivePose("auto", "morning"), "stand");
assert.equal(effectivePose("wave", "celebrate"), "wave", "a chosen pose wins over the day");
for (const pose of SIM_POSES.filter((value) => value !== "auto")) assert.ok(SIM_ARMS[pose], `${pose} has arms`);

assert.deepEqual(sanitizeShelf(["a", 1, "", "b"]), ["a", "b"]);
assert.equal(sanitizeShelf(["1", "2", "3", "4", "5", "6", "7"]).length, SIM_SHELF_MAX);
assert.deepEqual(sanitizeShelf("nope"), []);
storeSimShelf("u1", ["zodiac_leo", "element_fire"]);
assert.deepEqual(readSimShelf("u1"), ["zodiac_leo", "element_fire"]);

// Photo mode never sends the picture anywhere and keeps the visualization caption.
const photo = readFileSync("lib/simPhoto.ts", "utf8");
assert.match(photo, /querySelectorAll\("image"\)\.forEach/, "the profile photo is removed from the exported picture");
assert.match(photo, /options\.caption/);
assert.doesNotMatch(photo, /fetch\(/);

console.log("sim contract ok");
