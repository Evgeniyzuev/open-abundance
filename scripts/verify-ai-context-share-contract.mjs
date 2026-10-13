import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AI_CONTEXT_SHARE_PREFIXES,
  buildSharedContextLines,
  DEFAULT_AI_CONTEXT_SHARE,
  MAX_SHARED_CONTEXT_CHARS,
  MAX_SHARED_TASKS,
  normalizeAiContextShare
} from "../lib/ai/contextShare.ts";

// Optional parts of Nova's context: off by default, read from the device, bounded in size, accepted by the route.
assert.deepEqual(DEFAULT_AI_CONTEXT_SHARE, { tasks: false, notes: false, progress: false, finance: false });
assert.deepEqual(normalizeAiContextShare({ tasks: true, notes: "yes", extra: true }), { tasks: true, notes: false, progress: false, finance: false });
assert.deepEqual(normalizeAiContextShare(null), DEFAULT_AI_CONTEXT_SHARE);

const today = "2026-10-13"; // Tuesday
const tasks = [
  { id: "a", title: "Позвонить врачу", subtasks: ["Найти номер", "Позвонить"], doneSubtasks: [0], schedule: { type: "once", date: "2026-10-10" }, completed: false, updatedAt: "2026-10-10T08:00:00Z" },
  { id: "b", title: "Зарядка", subtasks: [], schedule: { type: "daily", startDate: "2026-10-01" }, completed: false, updatedAt: "2026-10-12T08:00:00Z" },
  { id: "c", title: "Готово давно", subtasks: [], schedule: { type: "once", date: "2026-10-01" }, completed: true, updatedAt: "2026-10-01T08:00:00Z" },
  { id: "d", title: "Удалённая", subtasks: [], schedule: { type: "once", date: today }, completed: false, deleted: true, updatedAt: "2026-10-13T08:00:00Z" },
  { id: "e", title: "Спортзал", subtasks: [], schedule: { type: "weekdays", startDate: "2026-10-01", weekdays: [2, 4] }, completed: false, updatedAt: "2026-10-11T08:00:00Z" }
];
const completions = [
  { taskId: "b", localDate: today, type: "done" },
  { taskId: "b", localDate: "2026-10-12", type: "done" },
  { taskId: "b", localDate: "2026-10-01", type: "done" },
  { taskId: "b", localDate: "2026-10-11", type: "life" }
];
const notes = [
  { title: "Молоко", body: "", listId: "shop", completed: false, updatedAt: "2026-10-13T07:00:00Z" },
  { title: "Идея", body: "Сделать сайт для мамы", completed: false, updatedAt: "2026-10-12T07:00:00Z" },
  { title: "Закрыто", body: "", completed: true, updatedAt: "2026-10-13T09:00:00Z" }
];
const lists = [{ id: "shop", title: "Покупки" }];
const input = { today, tasks, completions, notes, lists, coreBalance: 2, walletBalance: 10.5 };

assert.deepEqual(buildSharedContextLines(DEFAULT_AI_CONTEXT_SHARE, input), [], "nothing is shared until switched on");

const taskOnly = buildSharedContextLines({ ...DEFAULT_AI_CONTEXT_SHARE, tasks: true }, input);
assert.equal(taskOnly.length, 3, "completed and deleted tasks are left out");
assert.match(taskOnly[0], /^task: Позвонить врачу; overdue since 2026-10-10; steps 1\/2; next step: Позвонить$/, "overdue first, with the next step");
assert.match(taskOnly[1], /^task: Зарядка; daily; done today$/);
assert.match(taskOnly[2], /^task: Спортзал; today \(weekly routine\)$/);
assert.ok(taskOnly.every((line) => !/finance|note:/.test(line)), "only the chosen part is shared");

const notesOnly = buildSharedContextLines({ ...DEFAULT_AI_CONTEXT_SHARE, notes: true }, input);
assert.deepEqual(notesOnly, ["note: [Покупки] Молоко", "note: Идея — Сделать сайт для мамы"]);

assert.deepEqual(buildSharedContextLines({ ...DEFAULT_AI_CONTEXT_SHARE, progress: true }, input), ["progress: last 7 days 2 task check-offs on 2 of 7 days; today 1"]);
assert.deepEqual(buildSharedContextLines({ ...DEFAULT_AI_CONTEXT_SHARE, finance: true }, input), ["finance: Core balance $2.00", "finance: Wallet balance $10.50"]);

const many = Array.from({ length: 40 }, (_, index) => ({ id: `t${index}`, title: "Задача ".repeat(30), subtasks: [], schedule: { type: "once", date: today }, completed: false, updatedAt: "2026-10-13T00:00:00Z" }));
const bounded = buildSharedContextLines({ ...DEFAULT_AI_CONTEXT_SHARE, tasks: true }, { today, tasks: many });
assert.ok(bounded.length <= MAX_SHARED_TASKS);
assert.ok(bounded.join("\n").length <= MAX_SHARED_CONTEXT_CHARS, "context stays within its size budget");

// The chat route must accept these lines (and the always-on level), or they are silently dropped.
const route = readFileSync("app/api/ai/chat/route.ts", "utf8");
for (const prefix of [...AI_CONTEXT_SHARE_PREFIXES, "level:"]) assert.ok(route.includes(`"${prefix}"`), `route accepts ${prefix}`);

const chat = readFileSync("components/AiChatApp.tsx", "utf8");
assert.match(chat, /loadSharedContextLines\(contextShare/, "the chat sends the switched-on parts");
assert.match(chat, /type="checkbox" checked=\{contextShare\[key\]\}/, "each part has a checkbox in AI settings");

console.log("AI context share contract verified.");
