import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildNoteChatPrompt,
  guessNoteKind,
  isNoteAiMode,
  isQueueAction,
  NOTE_AI_CHAT_ACTIONS,
  NOTE_AI_QUEUE_ACTIONS,
  normalizeNoteAiResult,
  orderNoteAiActions
} from "../lib/noteAiReview.ts";

// Answers are cleaned: no empty text, short unique items, known kind only.
assert.equal(normalizeNoteAiResult(null), null);
assert.equal(normalizeNoteAiResult({ text: " " }), null);
const cleaned = normalizeNoteAiResult({ text: "Ok\n\n\n\nnext", kind: "spell", items: ["Call  Anna", "call anna", "", 5, "Buy milk"], list: "  Home ", question: "" });
assert.deepEqual(cleaned, { text: "Ok\n\nnext", items: ["Call Anna", "Buy milk"], list: "Home" });
assert.equal(normalizeNoteAiResult({ text: "x".repeat(3000) }).text.length, 1500);
assert.equal(normalizeNoteAiResult({ text: "ok", items: Array.from({ length: 12 }, (_, index) => `step ${index}`) }).items.length, 7);

// The menu order follows a rough guess of what the note is, in Russian and English.
assert.equal(guessNoteKind("Мне сегодня грустно"), "feeling");
assert.equal(guessNoteKind("I feel lonely"), "feeling");
assert.equal(guessNoteKind("Хочу дом у моря"), "wish");
assert.equal(guessNoteKind("позвонить маме"), "task");
assert.equal(guessNoteKind("А что если сделать карту"), "idea");
assert.equal(guessNoteKind("Трава зелёная"), "observation");
for (const kind of ["task", "wish", "idea", "observation", "feeling"]) {
  const order = orderNoteAiActions(kind);
  assert.equal(new Set(order).size, NOTE_AI_QUEUE_ACTIONS.length + NOTE_AI_CHAT_ACTIONS.length, kind);
}
assert.equal(orderNoteAiActions("feeling")[0], "support");
assert.equal(orderNoteAiActions("task")[0], "tasks");

// Support and discuss never go to the queue; the queue knows only its five actions and two modes.
for (const action of NOTE_AI_CHAT_ACTIONS) assert.equal(isQueueAction(action), false);
assert.equal(isQueueAction("plan"), true);
assert.equal(isNoteAiMode("deep"), true);
assert.equal(isNoteAiMode("slow"), false);
assert.match(buildNoteChatPrompt("support", "тяжёлый день", "ru"), /Без советов/);
assert.match(buildNoteChatPrompt("discuss", "idea", "en"), /Let's talk/);

// The migration and the API agree on the actions; the queue text is erased once the answer is delivered.
const migration = readFileSync(new URL("../supabase/migrations/20261024120000_note_ai_and_abundance.sql", import.meta.url), "utf8");
assert.match(migration, new RegExp(`action in \\(${NOTE_AI_QUEUE_ACTIONS.map((action) => `'${action}'`).join(", ")}\\)`));
const answers = readFileSync(new URL("../app/api/notes/ai-answers/route.ts", import.meta.url), "utf8");
assert.match(answers, /note_text: null/);
// Abundance notes stay in Supabase; the internal routes need Claude's token or an operator.
for (const route of ["../app/api/internal/abundance/route.ts", "../app/api/internal/notes/review/route.ts"]) {
  assert.match(readFileSync(new URL(route, import.meta.url), "utf8"), /authorizeClaudeOrOperator/);
}

console.log("note AI contract ok");
