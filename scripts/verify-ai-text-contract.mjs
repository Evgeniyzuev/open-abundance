import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plainChatText } from "../lib/ai/plainText.ts";

// Run with: node --experimental-strip-types scripts/verify-ai-text-contract.mjs
const read = (path) => readFileSync(path, "utf8");

// --- Markdown becomes plain speech, paragraphs stay ---
assert.equal(plainChatText("**Привет!** Это *важно*."), "Привет! Это важно.");
assert.equal(plainChatText("# Заголовок\n\nТекст"), "Заголовок\n\nТекст");
assert.equal(plainChatText("- один\n- два\n* три"), "один\nдва\nтри");
assert.equal(plainChatText("Первый абзац.\n\nВторой абзац."), "Первый абзац.\n\nВторой абзац.", "paragraphs are kept");
assert.equal(plainChatText("a\n\n\n\nb"), "a\n\nb", "long gaps are collapsed");
assert.equal(plainChatText("Считаем 2*3 = 6"), "Считаем 2*3 = 6", "a product between digits stays");
assert.equal(plainChatText("`код` и ```js\nx\n```"), "код и x\n");
assert.equal(plainChatText("Привет **мир"), "Привет мир", "a half-typed marker never shows while streaming");
assert.equal(plainChatText("---\nтекст"), "\nтекст".replace(/^\n/, ""), "rules are dropped");
assert.equal(plainChatText("> цитата"), "цитата");
assert.equal(plainChatText("[сайт](https://example.com)"), "сайт (https://example.com)");
assert.equal(plainChatText("1. шаг один"), "1. шаг один", "a numbered line is kept as written");

// --- The client keeps the paragraph breaks the server sends ---
const chat = read("components/AiChatApp.tsx");
assert.doesNotMatch(chat, /for \(const line of chunk\.split\("\n"\)\)/, "the stream must not be split on newlines and glued back");
assert.match(chat, /acc \+= decoder\.decode\(value, \{ stream: true \}\)/);
assert.match(chat, /plainChatText\(message\.content\)/, "answers are shown as plain text");

// --- Three visible attempts, errors never become history ---
assert.match(chat, /MAX_CHAT_ATTEMPTS = 3/);
assert.match(chat, /ai\.chat\.attempt/, "the attempt number is shown");
assert.match(chat, /ai\.chat\.retry/, "a retry button follows a final failure");
assert.match(chat, /!message\.failed/, "an error is never saved or sent back to the model");
assert.match(chat, /refundLocalMessage/, "a failed answer gives the message back to the local quota");

// --- Server: the quota is returned when no answer was produced ---
const route = read("app/api/ai/chat/route.ts");
assert.match(route, /refundAiChatMessage/);
assert.match(route, /!sawData/, "a stream that broke after text was delivered is not refunded");
const sql = read("supabase/migrations/20261011220000_ai_chat_quota_refund.sql");
assert.match(sql, /greatest\(message_count - 1, 0\)/);
assert.match(sql, /grant execute on function public\.refund_ai_chat_message\(uuid, text\) to service_role/);

// --- Prompt asks for plain speech ---
const knowledge = read("lib/ai/knowledge.ts");
assert.match(knowledge, /no asterisks, no hash signs, no bullet or dash lists/);
assert.match(knowledge, /two to four short paragraphs separated by a blank line/);

console.log("ai text contract ok");
