import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSeriousQuestion } from "../lib/ai/seriousness.ts";
import { addDays, decideNovaCard, pickNovaCard } from "../lib/novaCards.ts";

// Run with: node --experimental-strip-types scripts/verify-nova-cards-contract.mjs
const read = (path) => readFileSync(path, "utf8");

// --- Which questions look serious (a hint only, never an automatic switch) ---
assert.equal(isSeriousQuestion("Привет"), false);
assert.equal(isSeriousQuestion("Что такое ядро?"), false);
assert.equal(isSeriousQuestion("Стоит ли мне вложить 500 $ в ядро?"), true);
assert.equal(isSeriousQuestion("Рассчитай сценарий до третьего уровня"), true);
assert.equal(isSeriousQuestion("Как это работает? И зачем нужны уровни?"), true, "two questions");
assert.equal(isSeriousQuestion("Should I withdraw now?"), true);
assert.equal(isSeriousQuestion("а".repeat(360)), true, "a long message");
assert.equal(isSeriousQuestion(""), false);

// --- Which card, in priority order ---
const base = { ageDays: 30, daysSinceVisit: 0, hasWish: false, canTopUpToNextLevel: false };
assert.equal(pickNovaCard(base), null);
assert.equal(pickNovaCard({ ...base, ageDays: 1 }), "start");
assert.equal(pickNovaCard({ ...base, daysSinceVisit: 4, hasWish: true, canTopUpToNextLevel: true }), "return");
assert.equal(pickNovaCard({ ...base, canTopUpToNextLevel: true, hasWish: true }), "level");
assert.equal(pickNovaCard({ ...base, hasWish: true }), "step");
assert.equal(pickNovaCard({ ...base, ageDays: null, daysSinceVisit: null }), null);

// --- One card a day, dismissible, with a pause after three closed in a row ---
const first = decideNovaCard(null, "2026-10-12", "level");
assert.equal(first.show, "level");
const again = decideNovaCard(first.state, "2026-10-12", "step");
assert.equal(again.show, "level", "the same card all day, not a second one");
const closed = decideNovaCard({ ...first.state, dismissed: true }, "2026-10-12", "level");
assert.equal(closed.show, null, "a closed card stays closed today");
const used = decideNovaCard({ ...first.state, acted: true }, "2026-10-12", "level");
assert.equal(used.show, null, "a used card is not shown again today");

let state = null;
const shown = [];
for (let day = 0; day < 6; day += 1) {
  const today = addDays("2026-10-12", day);
  const decision = decideNovaCard(state, today, "step");
  shown.push(decision.show);
  state = decision.state ? { ...decision.state, dismissed: true } : state; // closed every time
}
assert.deepEqual(shown, ["step", "step", "step", null, null, null], "three closed in a row pause the cards");
assert.ok(state.pausedUntil > "2026-10-17", "the pause lasts a week");
assert.equal(decideNovaCard(state, addDays(state.pausedUntil, 0), "step").show, "step", "cards come back after the pause");

const usedStreak = decideNovaCard({ day: "2026-10-12", kind: "step", dismissed: true, acted: true, streak: 2 }, "2026-10-13", "step");
assert.equal(usedStreak.state.streak, 0, "using a card resets the streak");
assert.equal(decideNovaCard(null, "2026-10-12", null).show, null, "no candidate, no card");
assert.equal(addDays("2026-10-30", 3), "2026-11-02");

// --- Wiring ---
const card = read("components/NovaDailyCard.tsx");
assert.doesNotMatch(card, /fetch\(|rpc\(|\/api\//, "the daily card never calls a model or the server");
assert.match(read("components/AppNavigation.tsx"), /<NovaDailyCard active=\{showHome\} \/>/);

const route = read("app/api/ai/chat/route.ts");
assert.match(route, /body\.deep === true/);
assert.match(route, /quotaCharged = 2/, "a deep answer costs two messages");
assert.match(route, /refundCharged\(auth\.user!\.id, quotaCharged\)/, "a failed deep answer returns both messages");
const gateway = read("lib/ai/providerGateway.ts");
assert.match(gateway, /thinkingBudget: 2_048/, "deep answers let Gemini think");
assert.match(gateway, /openai\/gpt-oss-120b/, "the fallback for a deep answer is the larger Groq model");
assert.match(gateway, /getAvailableProviders\(deep \? "gemini"/, "deep answers try Gemini first");
const chat = read("components/AiChatApp.tsx");
assert.match(chat, /isSeriousQuestion\(/);
assert.match(chat, /sendMessage\(question, \{ deep: true \}\)/);
assert.match(chat, /!isByok && userId/, "the deep button is for the system route only");

console.log("nova cards contract ok");
