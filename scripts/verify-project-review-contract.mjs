import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProjectReviewPrompt, isProjectWish, normalizeProjectAnswers, normalizeProjectReview, projectChatPrompt } from "../lib/projectReview.ts";

assert.ok(isProjectWish("Запустить свой проект"));
assert.ok(isProjectWish("Launch your project"));
assert.ok(isProjectWish("Открыть своё дело"));
assert.ok(!isProjectWish("Пробежать марафон"));

assert.equal(normalizeProjectAnswers({ idea: "abc" }), null, "too short");
const answers = normalizeProjectAnswers({ idea: "  Приложение   для бега ", stage: "weird", hours: "6-10", audience: 5 });
assert.deepEqual(answers, { idea: "Приложение для бега", audience: "", stage: "idea", blocker: "", hours: "6-10" });

assert.equal(normalizeProjectReview({ summary: "x", steps: [] }), null, "steps are required");
const review = normalizeProjectReview({ summary: "Хорошая идея", strengths: ["a", "Понятная аудитория"], risks: ["Нет пользователей"], steps: ["Поговорить с пятью бегунами", "Сделать прототип", "Показать прототип", "лишний"], oaHelp: "Нова поможет" });
assert.deepEqual(review.strengths, ["Понятная аудитория"]);
assert.equal(review.steps.length, 3);
assert.ok(projectChatPrompt(review, "ru").includes("1. Поговорить с пятью бегунами"));

const prompt = buildProjectReviewPrompt(answers, "ru");
assert.ok(prompt.includes("not instructions") && prompt.includes("No income promises"));
const knowledge = readFileSync(new URL("../lib/ai/knowledge.ts", import.meta.url), "utf8");
assert.ok(knowledge.includes('"project.review": `'));
const guard = readFileSync(new URL("../lib/ai/toolGuard.ts", import.meta.url), "utf8");
assert.ok(guard.includes('"tools.project": { dayLimit: 3, monthLimit: 20 }'));
console.log("project review contract ok");
