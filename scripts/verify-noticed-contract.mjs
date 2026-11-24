// Contract for «Заметил» (lib/noticed.ts).
import assert from "node:assert/strict";
import { cleanTimes, normalizeNoticedPlan, describeTimes, cleanNoticedText, noticedPrompt } from "../lib/noticed.ts";

assert.deepEqual(cleanTimes(["16:00", "9:00", "11:00", "11:00", "25:00", "x", "08:30"]), ["08:30", "09:00", "11:00"]);
assert.deepEqual(cleanTimes("11:00"), []);
assert.equal(normalizeNoticedPlan({ reply: "x" }), null, "no action, no plan");
const plan = normalizeNoticedPlan({ reply: "Глаза устают от экрана.", action: "Поставь капли рядом с ноутбуком", times: ["16:00", "11:00"], pushTitle: "💧 Капли", pushBody: "Пара капель и 20 секунд вдаль" });
assert.deepEqual(plan.times, ["11:00", "16:00"]);
assert.equal(plan.weekdaysOnly, false);
assert.equal(normalizeNoticedPlan({ action: "Сделай шаг" }).pushTitle, "Сделай шаг");
assert.equal(describeTimes(["11:00", "16:00"], false, "ru"), "каждый день в 11:00 и 16:00");
assert.equal(describeTimes(["09:00"], true, "en"), "on weekdays at 09:00");
assert.equal(describeTimes([], false, "ru"), "");
assert.equal(cleanNoticedText("  a\n\n b ").length, 3);
assert.equal(cleanNoticedText("x".repeat(900)).length, 500);
assert.match(noticedPrompt("глаза", "ru", ["устал"]), /earlierNotes/);
console.log("noticed contract ok");
