import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMorningBody, hasMorningEntryOn, MORNING_CONTEXTS, MORNING_FIELDS, sanitizeContexts } from "../lib/morningCheckIn.ts";
import { computeWeekRecap } from "../lib/weekRecap.ts";

assert.deepEqual(sanitizeContexts(["health", "bogus", "work", "work"]), ["work", "health"], "known, unique, catalog order");
assert.deepEqual(sanitizeContexts("work"), []);

const labels = { body: "Body", money: "Money", feelings: "Feelings", mind: "Mind" };
assert.equal(buildMorningBody({ body: " tired ", money: "", mind: "launch" }, labels), "Body: tired\nMind: launch", "empty answers are skipped");
assert.equal(buildMorningBody({}, labels), "");

const noon = (day) => new Date(`${day}T12:00:00`).toISOString();
assert.equal(hasMorningEntryOn([{ createdAt: noon("2026-10-14"), morning: true }], "2026-10-14"), true);
assert.equal(hasMorningEntryOn([{ createdAt: noon("2026-10-14"), morning: true, deleted: true }], "2026-10-14"), false);
assert.equal(hasMorningEntryOn([{ createdAt: noon("2026-10-14") }], "2026-10-14"), false, "an ordinary note is not a check-in");
assert.equal(hasMorningEntryOn([{ createdAt: noon("2026-10-13"), morning: true }], "2026-10-14"), false);

const recap = computeWeekRecap({
  today: "2026-10-14",
  tasks: [],
  completions: [],
  notes: [
    { createdAt: noon("2026-10-13"), morning: true, contexts: ["work", "money"] },
    { createdAt: noon("2026-10-14"), morning: true, contexts: ["work", "family"] },
    { createdAt: noon("2026-10-14"), morning: true, contexts: ["health"], deleted: true },
    { createdAt: noon("2026-09-01"), morning: true, contexts: ["learning"] }
  ]
});
assert.equal(recap.mornings, 2, "deleted and old entries are excluded");
assert.equal(recap.contexts, 3, "distinct contexts of the week, as a count only");

// The recap image and share text stay numbers-only: contexts are never drawn.
const modal = readFileSync(new URL("../components/WeekRecapModal.tsx", import.meta.url), "utf8");
assert.ok(!modal.split("async function drawRecapImage")[1].includes("contexts"), "the image draws no context labels");

// Every key used by the UI exists in both languages.
const ru = readFileSync(new URL("../lib/messages/ru.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../lib/messages/en.ts", import.meta.url), "utf8");
const keys = [
  ...["open", "title", "homeTitle", "homeHint", "later", "noteTitle", "contexts", "save", "private"].map((k) => `morning.${k}`),
  ...MORNING_FIELDS.map((f) => `morning.field.${f}`),
  ...MORNING_CONTEXTS.map((c) => `context.${c}`),
  "weekRecap.mornings", "weekRecap.contexts", "weekRecap.manyContexts"
];
for (const key of keys) {
  assert.ok(ru.includes(`"${key}":`), `ru has ${key}`);
  assert.ok(en.includes(`"${key}":`), `en has ${key}`);
}

const component = readFileSync(new URL("../components/MorningCheckIn.tsx", import.meta.url), "utf8");
assert.ok(component.includes("morning: true"), "the check-in is an ordinary note marked morning");
assert.ok(!/fetch\(/.test(component), "nothing is sent to the server");
console.log("Morning check-in contract verified.");
