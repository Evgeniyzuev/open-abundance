import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIM_CLOTHES, SIM_SLOTS, readSimOutfit, storeSimOutfit } from "../lib/simWardrobe.ts";

assert.equal(new Set(SIM_CLOTHES.map((item) => item.id)).size, SIM_CLOTHES.length, "clothing ids are unique");
for (const slot of SIM_SLOTS) assert.ok(SIM_CLOTHES.some((item) => item.slot === slot), `slot ${slot} has clothes`);
for (const item of SIM_CLOTHES) {
  assert.ok(SIM_SLOTS.includes(item.slot), `${item.id} uses a known slot`);
  assert.ok(item.paths.length > 0 && item.paths.every((d) => /^M[\d\s.,a-zA-Z-]+$/.test(d)), `${item.id} has plain path data`);
}

// Every label exists in both languages.
const i18n = readFileSync("lib/i18n.ts", "utf8");
const keys = ["sim.title", ...SIM_SLOTS.map((slot) => `sim.slot.${slot}`), ...SIM_CLOTHES.map((item) => `sim.item.${item.id}`)];
for (const key of keys) assert.equal(i18n.split(`"${key}":`).length - 1, 2, `${key} in RU and EN`);

// The stored outfit is sanitised: unknown ids and ids in a wrong slot are dropped.
const store = new Map();
globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };
storeSimOutfit("u1", { top: "tshirt", head: "trousers", feet: "sneakers" });
assert.deepEqual(readSimOutfit("u1"), { top: "tshirt", feet: "sneakers" });
store.set("open-abundance-sim-outfit:u2", "not json");
assert.deepEqual(readSimOutfit("u2"), {});
assert.deepEqual(readSimOutfit(null), {});

console.log("sim contract ok");
