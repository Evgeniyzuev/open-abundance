import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSeriousQuestion } from "../lib/ai/seriousness.ts";
import { addDays, decideNovaCard, pickNovaCard } from "../lib/novaCards.ts";
import { acceptWeeklyText, hasWeeklyActivity, previousWeekStart, weekEndExclusive, weeklyFacts, weeklyFallbackText } from "../lib/novaWeekly.ts";

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
const base = { ageDays: 30, daysSinceVisit: 0, hasWish: false, canTopUpToNextLevel: false, hasWeeklySummary: false };
assert.equal(pickNovaCard(base), null);
assert.equal(pickNovaCard({ ...base, ageDays: 1 }), "start");
assert.equal(pickNovaCard({ ...base, daysSinceVisit: 4, hasWish: true, canTopUpToNextLevel: true }), "return");
assert.equal(pickNovaCard({ ...base, daysSinceVisit: 4, hasWeeklySummary: true }), "week", "the weekly summary comes before a return card");
assert.equal(pickNovaCard({ ...base, ageDays: 1, hasWeeklySummary: true }), "start", "a newcomer sees the start card first");
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
assert.doesNotMatch(card, /\/api\/ai\/chat/, "the daily card never starts a model call itself");
assert.match(card, /\/api\/nova\/weekly/, "the weekly summary comes from its own cached endpoint");
assert.match(read("components/AppNavigation.tsx"), /<NovaDailyCard\s+active=\{showHome\}/);

const route = read("app/api/ai/chat/route.ts");
assert.match(route, /body\.deep === true/);
assert.match(route, /quotaCharged = 2/, "a deep answer costs two messages");
assert.match(route, /refundCharged\(auth\.user!\.id, quotaCharged, capability\)/, "a failed deep answer returns both messages");
const gateway = read("lib/ai/providerGateway.ts");
assert.match(gateway, /thinkingBudget: 2_048/, "deep answers let Gemini think");
assert.match(gateway, /openai\/gpt-oss-120b/, "the fallback for a deep answer is the larger Groq model");
assert.match(gateway, /AI_DEEP_PRIMARY_PROVIDER/, "the provider for deep answers can be switched");
const chat = read("components/AiChatApp.tsx");
assert.match(chat, /isSeriousQuestion\(/);
assert.match(chat, /sendMessage\(question, \{ deep: true \}\)/);
assert.match(chat, /!isByok && userId/, "the deep button is for the system route only");

// --- Second look (the delayed second answer) ---
assert.match(route, /body\.mode === "followup"/);
assert.match(route, /FOLLOWUP_DAY_LIMIT = 3/, "at most three second looks a day");
assert.match(route, /NOTHING/, "a complete answer gets no second note");
assert.match(route, /preferProvider: followup \? "gemini"/, "the second look prefers the larger-context model");
assert.match(chat, /mode: "followup"/);
assert.match(chat, /followupAllowed\(userId\)/);
assert.match(chat, /followupAbortRef\.current\?\.abort\(\)/, "a new question cancels a second look still running");
assert.match(chat, /mergeAdjacentAssistants/, "the note joins the answer before the next question is sent");

// --- Weekly summary ---
assert.equal(previousWeekStart(Date.parse("2026-10-14T12:00:00Z")), "2026-10-05", "Wednesday: the week that ended on Sunday 11 October");
assert.equal(previousWeekStart(Date.parse("2026-10-12T00:00:01Z")), "2026-10-05", "Monday: the week that just ended");
assert.equal(previousWeekStart(Date.parse("2026-10-11T23:59:59Z")), "2026-09-28", "Sunday: the week is not over yet");
assert.equal(weekEndExclusive("2026-10-05"), "2026-10-12");
const stats = { weekStart: "2026-10-05", coreStart: 100, coreEnd: 112.5, accrued: 0.44, challengesCompleted: 2, novaMessages: 5, postsPublished: 0, wishesAdded: 1, activeDays: 4 };
assert.equal(hasWeeklyActivity(stats), true);
assert.equal(hasWeeklyActivity({ ...stats, activeDays: 0, challengesCompleted: 0, novaMessages: 0, wishesAdded: 0 }), false, "no activity, no summary");
const facts = weeklyFacts(stats);
assert.ok(facts.some((line) => line.includes("4 of 7")) && facts.some((line) => line.includes("100.00") && line.includes("112.50")));
assert.ok(!facts.some((line) => line.includes("posts")), "a zero count is not mentioned");
const fallback = weeklyFallbackText(stats, "ru");
assert.ok(fallback.includes("4 из 7") && fallback.includes("112.50") && fallback.includes("заданий выполнено: 2"));
assert.ok(!/гарант|доход обеспеч/i.test(fallback), "the template promises nothing");
assert.equal(acceptWeeklyText("коротко"), null);
assert.ok(acceptWeeklyText("Эта неделя была спокойной: вы заходили четыре дня и выполнили два задания. Выберите один маленький шаг на следующую."));
assert.equal(acceptWeeklyText("а".repeat(901)), null);
const weekly = read("app/api/nova/weekly/route.ts");
assert.match(weekly, /nova_weekly_summaries/, "the summary is written once and cached");
assert.match(weekly, /hasWeeklyActivity\(stats\)/, "no model call for a person with no activity");
assert.match(weekly, /weeklyFallbackText/, "a model failure falls back to the template");
assert.match(read("supabase/migrations/20261011230000_nova_weekly_summaries.sql"), /revoke all on public\.nova_weekly_summaries from public, anon, authenticated/);
assert.match(card, /oa-nova-week-fetched/, "the browser asks at most once a week");

console.log("nova cards contract ok");
